import { createHash } from 'node:crypto';
import type {
  ActivityDoc,
  ActivityResultsDoc,
  AiJobDoc,
  ClassDoc,
  ClusterDoc,
  InsightItem,
  PostAuthorDoc,
  PostDoc,
  SessionDoc,
  SessionStatsDoc,
  SessionSummarySections,
  SubmissionDoc,
  UserDoc,
} from '@classinteract/shared';
import { EXIT_TICKET_QUESTIONS, isOpenQuestionStatus } from '@classinteract/shared';
import { config } from '../../config';
import { db, now } from '../../firebase';
import { aggregateTopics, loadClassPosts, loadSessionsWithStats, loadStudents, interactionsOf } from '../../lib/classData';
import { AppError, notFound } from '../../lib/errors';
import { registerJobHandler } from '../../lib/jobs';
import { C } from '../../lib/paths';
import { notify } from '../notifications';
import { classTopicNames, ensureCatalogTopic } from '../topics';
import { DATA_GUARD, executeStructured, fence, languageLine } from './executor';
import { cosine, embedTexts, getAdapter } from './providers';
import { getAiSettings } from './settings';

// ---------------------------------------------------------------- helpers
async function jobContext(job: AiJobDoc) {
  const [clsSnap, userSnap] = await Promise.all([C.class(job.classId).get(), C.user(job.requestedBy).get()]);
  if (!clsSnap.exists) throw notFound('Không tìm thấy lớp học');
  return { cls: clsSnap.data() as ClassDoc, user: userSnap.data() as UserDoc };
}

const courseLine = (cls: ClassDoc) => `Học phần / Course: ${cls.courseCode} – ${cls.courseName}`;

function rootPostsOf(posts: PostDoc[]) {
  return posts.filter((p) => p.isRoot && p.moderationStatus === 'visible' && !p.isAiGenerated);
}

async function postsInScope(classId: string, sessionId: string | null) {
  if (sessionId) {
    const snap = await C.posts(classId, sessionId).get();
    return snap.docs.map((d) => d.data() as PostDoc);
  }
  return loadClassPosts(classId);
}

/** Embedding provider in use, or null (then clustering falls back to the language model). */
export async function embeddingConfig() {
  const s = await getAiSettings();
  const pick = async (p: 'openai' | 'gemini') => (s.providers[p].enabled && (await getAdapter(p).isConfigured()) ? p : null);
  const provider = s.embedding?.provider ? await pick(s.embedding.provider) : ((await pick('openai')) ?? (await pick('gemini')));
  if (!provider) return null;
  const model = s.embedding?.provider === provider && s.embedding.model ? s.embedding.model : provider === 'openai' ? 'text-embedding-3-small' : 'gemini-embedding-001';
  const threshold = s.embedding?.threshold ?? (config.ai.fake ? 0.5 : provider === 'openai' ? 0.6 : 0.8);
  return { provider, model, threshold };
}

const textHash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** Returns embeddings for posts, computing and caching missing ones in postEmbeddings/. */
export async function embeddingsFor(classId: string, posts: PostDoc[], cfg: NonNullable<Awaited<ReturnType<typeof embeddingConfig>>>) {
  const col = db.collection('postEmbeddings');
  const refs = posts.map((p) => col.doc(`${classId}_${p.postId}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const out = new Map<string, number[]>();
  const missing: PostDoc[] = [];
  posts.forEach((p, i) => {
    const d = snaps[i]?.data();
    if (d && d.model === cfg.model && d.hash === textHash(p.content)) out.set(p.postId, d.vector as number[]);
    else missing.push(p);
  });
  for (let i = 0; i < missing.length; i += 96) {
    const part = missing.slice(i, i + 96);
    const vectors = await embedTexts(cfg.provider, cfg.model, part.map((p) => p.content.slice(0, 2000)));
    const batch = db.batch();
    part.forEach((p, j) => {
      const v = vectors[j];
      if (!v?.length) return;
      out.set(p.postId, v);
      batch.set(col.doc(`${classId}_${p.postId}`), { classId, sessionId: p.sessionId, postId: p.postId, model: cfg.model, hash: textHash(p.content), vector: v, updatedAt: now() });
    });
    await batch.commit();
  }
  return out;
}

// ---------------------------------------------------------------- 1. topic classification
const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, topics: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'topics'],
        additionalProperties: false,
      },
    },
    newTopics: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, description: { type: 'string' } },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['items', 'newTopics'],
  additionalProperties: false,
};

registerJobHandler('classify_topics', async (job, progress) => {
  const { cls, user } = await jobContext(job);
  const force = job.params.force === true;
  const posts = rootPostsOf(await postsInScope(cls.classId, job.sessionId)).filter((p) => force || !p.aiTopics);
  if (!posts.length) return { classified: 0, newTopics: [] };
  const { catalog, names } = await classTopicNames(cls.classId);
  const known = new Map(names.map((n) => [n.toLowerCase(), n]));
  const desc = new Map(catalog.map((c) => [c.name, c.description]));
  const created: string[] = [];
  let classified = 0;
  const BATCH = 40;
  for (let i = 0; i < Math.min(posts.length, 400); i += BATCH) {
    const part = posts.slice(i, i + BATCH);
    await progress(`${i}/${posts.length}`);
    const topicList = [...known.values()].map((n) => `- ${n}${desc.get(n) ? `: ${desc.get(n)}` : ''}`).join('\n') || '(chưa có / none yet)';
    const system = `Bạn phân loại câu hỏi và ý kiến của sinh viên đại học theo chủ đề kiến thức của học phần.
Với mỗi bài, chọn 1–3 chủ đề phù hợp nhất từ danh sách có sẵn. Chỉ đề xuất chủ đề mới (tối đa 3 cho cả lô) khi không chủ đề nào phù hợp; tên chủ đề ngắn (≤ 5 từ), cùng ngôn ngữ với các chủ đề hiện có.
Bài không liên quan nội dung học tập: trả về danh sách chủ đề rỗng.
${DATA_GUARD}
${languageLine(job.lang)} Trả về đúng JSON theo schema.`;
    const prompt = `<context>\n${courseLine(cls)}\nChủ đề hiện có / existing topics:\n${topicList}\n</context>\n<posts>\n${part
      .map((p) => `[${p.postId}] ${fence(p.content, 600)}`)
      .join('\n')}\n</posts>`;
    const r = await executeStructured({
      cls,
      user,
      taskType: 'classify',
      sessionId: job.sessionId,
      jobId: job.jobId,
      sourceRefs: part.map((p) => `post:${p.postId}`),
      system,
      prompt,
      schemaName: 'topic_classification',
      schema: CLASSIFY_SCHEMA,
      maxOutputTokens: 3000,
    });
    const out = r.json as { items?: { id: string; topics: string[] }[]; newTopics?: { name: string; description: string }[] };
    for (const t of (out.newTopics ?? []).slice(0, 3)) {
      const name = t.name.trim().slice(0, 80);
      if (!name || known.has(name.toLowerCase())) continue;
      await ensureCatalogTopic(cls.classId, name, 'ai', user.uid, t.description.slice(0, 500));
      known.set(name.toLowerCase(), name);
      created.push(name);
    }
    const byId = new Map(part.map((p) => [p.postId, p]));
    const batch = db.batch();
    for (const it of out.items ?? []) {
      const p = byId.get(it.id);
      if (!p) continue;
      const topics = [...new Set(it.topics.map((t) => known.get(t.trim().toLowerCase())).filter((t): t is string => !!t))].slice(0, 3);
      const already = topics.every((t) => p.topics?.includes(t));
      batch.update(C.posts(cls.classId, p.sessionId).doc(p.postId), {
        aiTopics: topics,
        topicReview: topics.length === 0 || already ? 'accepted' : 'pending',
      });
      classified++;
    }
    await batch.commit();
  }
  return { classified, newTopics: created, total: posts.length };
});

// ---------------------------------------------------------------- 2. question clustering
const CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, description: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'description', 'ids'],
        additionalProperties: false,
      },
    },
  },
  required: ['clusters'],
  additionalProperties: false,
};

function greedyClusters(ids: string[], vectors: Map<string, number[]>, threshold: number) {
  const clusters: { ids: string[]; centroid: number[] }[] = [];
  for (const id of ids) {
    const v = vectors.get(id);
    if (!v) continue;
    let best = -1;
    let bestSim = threshold;
    clusters.forEach((c, i) => {
      const sim = cosine(v, c.centroid);
      if (sim >= bestSim) {
        bestSim = sim;
        best = i;
      }
    });
    if (best >= 0) {
      const c = clusters[best]!;
      c.ids.push(id);
      c.centroid = c.centroid.map((x, k) => x + (v[k]! - x) / c.ids.length);
    } else clusters.push({ ids: [id], centroid: [...v] });
  }
  return clusters.filter((c) => c.ids.length >= 2).map((c) => c.ids);
}

registerJobHandler('cluster_questions', async (job, progress) => {
  const { cls, user } = await jobContext(job);
  const scope: 'session' | 'class' = job.sessionId ? 'session' : 'class';
  const all = await postsInScope(cls.classId, job.sessionId);
  const questions = rootPostsOf(all).filter((p) => p.type === 'question').slice(0, 1000);
  const existing = await C.class(cls.classId).collection('clusters').where('scope', '==', scope).get();
  const mine = existing.docs.filter((d) => ((d.data() as ClusterDoc).sessionId ?? null) === (job.sessionId ?? null));
  const locked = mine.filter((d) => (d.data() as ClusterDoc).locked);
  const lockedIds = new Set(locked.flatMap((d) => (d.data() as ClusterDoc).items.map((i) => i.postId)));
  const pool = questions.filter((q) => !lockedIds.has(q.postId));
  const byId = new Map(questions.map((q) => [q.postId, q]));

  let groups: { name: string; description: string; ids: string[] }[] = [];
  let method: ClusterDoc['method'] = 'llm';
  const cfg = await embeddingConfig();
  if (pool.length >= 2) {
    if (cfg) {
      method = 'embedding';
      await progress('embeddings');
      const vectors = await embeddingsFor(cls.classId, pool, cfg);
      const idGroups = greedyClusters(pool.map((p) => p.postId), vectors, cfg.threshold);
      if (idGroups.length) {
        await progress('naming');
        const prompt = `<context>\n${courseLine(cls)}\n</context>\n<posts>\n${idGroups
          .map((g, i) => `Nhóm ${i + 1}: ids=${g.join(',')}\n${g.slice(0, 6).map((id) => `- ${fence(byId.get(id)!.content, 300)}`).join('\n')}`)
          .join('\n\n')}\n</posts>`;
        const r = await executeStructured({
          cls,
          user,
          taskType: 'cluster',
          sessionId: job.sessionId,
          jobId: job.jobId,
          sourceRefs: idGroups.flat().map((id) => `post:${id}`),
          system: `Mỗi nhóm dưới đây gồm các câu hỏi gần nghĩa của sinh viên. Đặt cho mỗi nhóm một tên vấn đề ngắn gọn và một mô tả 1–2 câu. Giữ nguyên danh sách ids của từng nhóm.\n${DATA_GUARD}\n${languageLine(job.lang)}`,
          prompt,
          schemaName: 'cluster_names',
          schema: CLUSTER_SCHEMA,
          maxOutputTokens: 3000,
        }).catch(() => null);
        const named = (r?.json as { clusters?: { name: string; description: string; ids: string[] }[] } | undefined)?.clusters ?? [];
        groups = idGroups.map((ids, i) => {
          const n = named.find((c) => c.ids?.some((id) => ids.includes(id))) ?? named[i];
          return { name: n?.name?.slice(0, 200) || byId.get(ids[0]!)!.content.slice(0, 80), description: n?.description?.slice(0, 1000) ?? '', ids };
        });
      }
    } else {
      await progress('llm');
      const r = await executeStructured({
        cls,
        user,
        taskType: 'cluster',
        sessionId: job.sessionId,
        jobId: job.jobId,
        sourceRefs: pool.map((p) => `post:${p.postId}`),
        system: `Gom các câu hỏi của sinh viên có cùng ý nghĩa (dù diễn đạt khác nhau) vào cùng một nhóm vấn đề. Mỗi nhóm có ít nhất 2 câu hỏi; câu hỏi không trùng ý với câu nào thì bỏ qua. Đặt tên vấn đề ngắn gọn và mô tả 1–2 câu. Chỉ dùng ids có trong dữ liệu.\n${DATA_GUARD}\n${languageLine(job.lang)}`,
        prompt: `<context>\n${courseLine(cls)}\n</context>\n<posts>\n${pool.slice(0, 300).map((p) => `[${p.postId}] ${fence(p.content, 300)}`).join('\n')}\n</posts>`,
        schemaName: 'question_clusters',
        schema: CLUSTER_SCHEMA,
        maxOutputTokens: 4000,
      });
      const valid = new Set(pool.map((p) => p.postId));
      const seen = new Set<string>();
      groups = ((r.json as { clusters?: { name: string; description: string; ids: string[] }[] }).clusters ?? [])
        .map((c) => ({ name: c.name.slice(0, 200), description: c.description.slice(0, 1000), ids: c.ids.filter((id) => valid.has(id) && !seen.has(id) && (seen.add(id), true)) }))
        .filter((c) => c.ids.length >= 2);
    }
  }

  // statistics need the real authors (anonymous posts included)
  const authors = await db.collectionGroup('postAuthor').where('classId', '==', cls.classId).get();
  const authorOf = new Map(authors.docs.map((d) => [(d.data() as PostAuthorDoc).postId, (d.data() as PostAuthorDoc).authorUid]));
  const batch = db.batch();
  mine.filter((d) => !(d.data() as ClusterDoc).locked).forEach((d) => batch.delete(d.ref));
  for (const g of groups) {
    const ref = C.class(cls.classId).collection('clusters').doc();
    const qs = g.ids.map((id) => byId.get(id)!);
    batch.set(ref, {
      clusterId: ref.id,
      classId: cls.classId,
      scope,
      sessionId: job.sessionId ?? null,
      name: g.name,
      description: g.description,
      items: qs.map((q) => ({ sessionId: q.sessionId, postId: q.postId })),
      ...clusterStats(qs, authorOf),
      locked: false,
      method,
      jobId: job.jobId,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batch.commit();
  return { clusters: groups.length, method, questions: questions.length, grouped: groups.reduce((s, g) => s + g.ids.length, 0) };
});

export function clusterStats(qs: PostDoc[], authorOf: Map<string, string | null>) {
  const students = new Set(qs.map((q) => authorOf.get(q.postId) ?? q.authorId).filter(Boolean));
  const open = qs.filter((q) => isOpenQuestionStatus(q.status)).length;
  const votes = qs.reduce((s, q) => s + (q.voteCount ?? 0) + (q.reactionCounts?.same_question ?? 0), 0);
  return {
    questionCount: qs.length,
    studentCount: students.size,
    sessionCount: new Set(qs.map((q) => q.sessionId)).size,
    voteCount: votes,
    interest: students.size + votes,
    openCount: open,
    status: open === 0 ? 'resolved' : 'open',
  };
}

// ---------------------------------------------------------------- 3. session summary
const ITEM = {
  type: 'object',
  properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } },
  required: ['text', 'refs'],
  additionalProperties: false,
};
const LIST = { type: 'array', items: ITEM };
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    mainContent: { type: 'string' },
    topicsDiscussed: LIST,
    keyQuestions: LIST,
    confirmedAnswers: LIST,
    unresolved: LIST,
    difficulties: LIST,
    popular: LIST,
    nextSession: LIST,
  },
  required: ['mainContent', 'topicsDiscussed', 'keyQuestions', 'confirmedAnswers', 'unresolved', 'difficulties', 'popular', 'nextSession'],
  additionalProperties: false,
};

async function activityDigest(classId: string, sessionId: string) {
  const acts = (await C.activities(classId, sessionId).get()).docs.map((d) => d.data() as ActivityDoc).filter((a) => a.status !== 'draft');
  const lines: string[] = [];
  const exitAnswers: string[][] = [[], [], []];
  for (const a of acts) {
    const r = (await C.activityResults(classId, sessionId, a.activityId).get()).data() as ActivityResultsDoc | undefined;
    if (a.type === 'free_text' || a.type === 'exit_ticket') {
      const subs = (await C.submissions(classId, sessionId, a.activityId).limit(200).get()).docs.map((d) => d.data() as SubmissionDoc);
      if (a.type === 'exit_ticket') subs.forEach((s) => s.answers?.forEach((x, i) => x && exitAnswers[i]?.push(x)));
      else lines.push(`[activity ${a.activityId}] ${a.title} (${r?.submissionCount ?? 0} responses): ${subs.slice(0, 30).map((s) => fence(s.text, 200)).join(' | ')}`);
    } else {
      const total = r?.submissionCount ?? 0;
      const opts = a.options.map((o) => `${o.label}: ${r?.optionCounts?.[o.id] ?? 0}`).join(', ');
      const correct = a.type === 'quiz' && total ? `; correct ${Math.round(((r?.correctCount ?? 0) / total) * 100)}%` : '';
      lines.push(`[activity ${a.activityId}] ${a.type}: ${a.title} — ${total} responses (${opts}${correct})`);
    }
  }
  return { lines, exitAnswers };
}

registerJobHandler('summarize_session', async (job, progress) => {
  if (!job.sessionId) throw new AppError(400, 'BAD_REQUEST', 'Thiếu buổi học');
  const { cls, user } = await jobContext(job);
  const sSnap = await C.session(cls.classId, job.sessionId).get();
  if (!sSnap.exists) throw notFound('Không tìm thấy buổi học');
  const s = sSnap.data() as SessionDoc;
  const stats = (await C.sessionStats(cls.classId, job.sessionId).get()).data() as SessionStatsDoc | undefined;
  const posts = (await postsInScope(cls.classId, job.sessionId)).filter((p) => p.moderationStatus === 'visible');
  const roots = posts.filter((p) => p.isRoot).sort((a, b) => b.voteCount - a.voteCount);
  const repliesOf = (id: string) => posts.filter((p) => p.rootPostId === id);
  await progress('collect');
  const { lines, exitAnswers } = await activityDigest(cls.classId, job.sessionId);
  let budget = 45000;
  const postLines: string[] = [];
  for (const r of roots) {
    const reps = repliesOf(r.postId)
      .sort((a, b) => Number(b.isAccepted) - Number(a.isAccepted))
      .slice(0, 4)
      .map((x) => `   ↳ [${x.postId}] (${x.isAccepted ? 'accepted' : x.authorRole === 'lecturer' ? 'lecturer' : x.isAiGenerated ? 'AI' : 'student'}) ${fence(x.content, 400)}`);
    const line = `[${r.postId}] ${r.type}${r.status ? `/${r.status}` : ''} votes=${r.voteCount} need_explanation=${r.reactionCounts?.need_explanation ?? 0} understood=${r.reactionCounts?.understood ?? 0} topics=${(r.topics ?? []).join('|')}: ${fence(r.content, 600)}\n${reps.join('\n')}`;
    if ((budget -= line.length) < 0) break;
    postLines.push(line);
  }
  const exit = exitAnswers
    .map((list, i) => (list.length ? `${EXIT_TICKET_QUESTIONS[i]}\n${list.slice(0, 60).map((x) => `- ${fence(x, 200)}`).join('\n')}` : ''))
    .filter(Boolean)
    .join('\n\n');
  const system = `Bạn hỗ trợ giảng viên tổng kết một buổi học đại học dựa trên dữ liệu tương tác đã ghi nhận.
Viết bản tóm tắt gồm: nội dung học tập chính; các chủ đề được thảo luận; những câu hỏi quan trọng; các câu trả lời đã được xác nhận (accepted hoặc của giảng viên); vấn đề chưa được giải đáp; nội dung sinh viên gặp khó khăn (dựa trên need_explanation, câu hỏi mở, quiz sai nhiều, phiếu cuối buổi); nội dung được nhiều sinh viên quan tâm (votes); gợi ý cho buổi học tiếp theo.
Mỗi mục là một nhận định ngắn, kèm refs là các id bài đăng [..] làm căn cứ (chỉ dùng id có trong dữ liệu). Chỉ dựa trên dữ liệu; không bịa nội dung. Nếu dữ liệu ít, viết ngắn.
${DATA_GUARD}
${languageLine(job.lang)}`;
  const prompt = `<context>\n${courseLine(cls)}\nBuổi ${s.sessionNumber}: ${fence(s.title, 200)} (${s.date})\nNội dung dự kiến: ${fence(s.description, 1500)}\nChủ đề: ${s.topics.join(', ')}\nThống kê: ${stats?.attendeeCount ?? 0} sinh viên tham gia, ${stats?.questionCount ?? 0} câu hỏi, ${stats?.answerCount ?? 0} trả lời, ${stats?.openQuestionCount ?? 0} câu hỏi chưa giải đáp\n</context>\n<posts>\n${postLines.join('\n')}\n</posts>\n<activities>\n${lines.join('\n')}\n</activities>\n<responses>\n${exit}\n</responses>`;
  await progress('generate');
  const r = await executeStructured({
    cls,
    user,
    taskType: 'summarize',
    sessionId: job.sessionId,
    jobId: job.jobId,
    sourceRefs: roots.map((p) => `post:${p.postId}`),
    system,
    prompt,
    schemaName: 'session_summary',
    schema: SUMMARY_SCHEMA,
    maxOutputTokens: 6000,
  });
  const valid = new Set(posts.map((p) => p.postId));
  const raw = r.json as Partial<SessionSummarySections>;
  const clean = (list?: { text: string; refs: string[] }[]) =>
    (list ?? []).slice(0, 15).map((i) => ({ text: String(i.text ?? '').slice(0, 1500), refs: (i.refs ?? []).filter((x) => valid.has(x)).slice(0, 20) })).filter((i) => i.text);
  const sections: SessionSummarySections = {
    mainContent: String(raw.mainContent ?? '').slice(0, 4000),
    topicsDiscussed: clean(raw.topicsDiscussed),
    keyQuestions: clean(raw.keyQuestions),
    confirmedAnswers: clean(raw.confirmedAnswers),
    unresolved: clean(raw.unresolved),
    difficulties: clean(raw.difficulties),
    popular: clean(raw.popular),
    nextSession: clean(raw.nextSession),
  };
  await C.session(cls.classId, job.sessionId).collection('summary').doc('current').set({
    classId: cls.classId,
    sessionId: job.sessionId,
    status: 'draft',
    published: false,
    sections,
    lang: job.lang,
    aiRunId: r.runId,
    jobId: job.jobId,
    generatedAt: now(),
    editedBy: null,
    approvedBy: null,
    approvedAt: null,
    updatedAt: now(),
  });
  await notify([user.uid], {
    type: 'summary_ready',
    title: 'Bản tóm tắt buổi học đã sẵn sàng',
    body: 'Buổi {{n}}: {{title}}',
    bodyParams: { n: s.sessionNumber, title: s.title },
    link: `/teach/classes/${cls.classId}/sessions/${job.sessionId}?tab=summary`,
  });
  return { runId: r.runId, posts: roots.length };
});

// ---------------------------------------------------------------- 4. free-text / exit-ticket summary
const ACTIVITY_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' }, count: { type: 'number' } },
        required: ['title', 'detail', 'count'],
        additionalProperties: false,
      },
    },
    difficulties: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'themes', 'difficulties', 'suggestions'],
  additionalProperties: false,
};

registerJobHandler('summarize_activity', async (job) => {
  const activityId = String(job.params.activityId ?? '');
  if (!job.sessionId || !activityId) throw new AppError(400, 'BAD_REQUEST', 'Thiếu hoạt động');
  const { cls, user } = await jobContext(job);
  const aSnap = await C.activities(cls.classId, job.sessionId).doc(activityId).get();
  if (!aSnap.exists) throw notFound('Không tìm thấy hoạt động');
  const a = aSnap.data() as ActivityDoc;
  const subs = (await C.submissions(cls.classId, job.sessionId, activityId).limit(400).get()).docs.map((d) => d.data() as SubmissionDoc);
  if (!subs.length) return { responses: 0 };
  const body =
    a.type === 'exit_ticket'
      ? EXIT_TICKET_QUESTIONS.map((q, i) => `${q}\n${subs.map((s) => s.answers?.[i]).filter(Boolean).slice(0, 150).map((x) => `- ${fence(x!, 250)}`).join('\n')}`).join('\n\n')
      : subs.slice(0, 300).map((s) => `- ${fence(s.text, 300)}`).join('\n');
  const r = await executeStructured({
    cls,
    user,
    taskType: 'activity_summary',
    sessionId: job.sessionId,
    jobId: job.jobId,
    sourceRefs: [`activity:${activityId}`],
    system: `Tổng hợp câu trả lời của sinh viên cho một hoạt động trên lớp: tổng quan ngắn, các ý chính (kèm số câu trả lời ước tính cho mỗi ý), những điểm sinh viên còn chưa hiểu hoặc hiểu sai, gợi ý cho giảng viên. Chỉ dựa trên dữ liệu.\n${DATA_GUARD}\n${languageLine(job.lang)}`,
    prompt: `<context>\n${courseLine(cls)}\nHoạt động: ${fence(a.title, 300)}\n${fence(a.prompt, 1000)}\nSố câu trả lời: ${subs.length}\n</context>\n<responses>\n${body}\n</responses>`,
    schemaName: 'activity_summary',
    schema: ACTIVITY_SUMMARY_SCHEMA,
    maxOutputTokens: 3000,
  });
  await C.activities(cls.classId, job.sessionId).doc(activityId).collection('staff').doc('aiSummary').set({
    ...(r.json as object),
    responses: subs.length,
    aiRunId: r.runId,
    lang: job.lang,
    generatedAt: now(),
  });
  return { responses: subs.length, runId: r.runId };
});

// ---------------------------------------------------------------- 5. teaching insights
const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['topic_questions', 'misconception', 'unanswered', 'needs_explanation', 'participation', 'suggestion'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['category', 'title', 'detail', 'evidence', 'refs'],
        additionalProperties: false,
      },
    },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['insights', 'followUpQuestions'],
  additionalProperties: false,
};

registerJobHandler('teaching_insights', async (job, progress) => {
  const { cls, user } = await jobContext(job);
  await progress('collect');
  const [posts, sessions, students, clustersSnap] = await Promise.all([
    loadClassPosts(cls.classId),
    loadSessionsWithStats(cls.classId),
    loadStudents(cls.classId),
    C.class(cls.classId).collection('clusters').get(),
  ]);
  const visible = posts.filter((p) => p.moderationStatus === 'visible');
  const topics = aggregateTopics(posts).slice(0, 20);
  const unanswered = visible
    .filter((p) => p.type === 'question' && isOpenQuestionStatus(p.status))
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 20);
  const unclear = visible
    .filter((p) => (p.reactionCounts?.need_explanation ?? 0) > 0)
    .sort((a, b) => (b.reactionCounts?.need_explanation ?? 0) - (a.reactionCounts?.need_explanation ?? 0))
    .slice(0, 15);
  const held = sessions.filter((s) => s.startedAt);
  const quizLines: string[] = [];
  for (const s of held.slice(-8)) {
    const { lines } = await activityDigest(cls.classId, s.sessionId);
    lines.filter((l) => /quiz|understanding|poll/.test(l)).forEach((l) => quizLines.push(`B${s.sessionNumber} ${l}`));
  }
  const inter = students.map((s) => interactionsOf(s.metrics));
  const dist = {
    students: students.length,
    none: inter.filter((x) => x === 0).length,
    low: inter.filter((x) => x > 0 && x <= 2).length,
    medium: inter.filter((x) => x > 2 && x <= 10).length,
    high: inter.filter((x) => x > 10).length,
  };
  const clusters = clustersSnap.docs
    .map((d) => d.data() as ClusterDoc)
    .sort((a, b) => b.interest - a.interest)
    .slice(0, 15);
  const prompt = `<context>
${courseLine(cls)}
Buổi đã diễn ra: ${held.length}
Tham gia theo buổi: ${held.map((s) => `B${s.sessionNumber}: ${s.stats?.attendeeCount ?? 0} có mặt, ${s.stats?.interactedCount ?? 0} có tương tác, ${s.stats?.questionCount ?? 0} câu hỏi`).join('; ')}
Phân bố số tương tác của sinh viên (không nêu tên): ${JSON.stringify(dist)}
Chủ đề: ${topics.map((t) => `${t.topic} (${t.questions} hỏi, ${t.answers} đáp, ${t.openQuestions} chưa giải đáp, ${t.participants} SV)`).join('; ')}
Nhóm vấn đề: ${clusters.map((c) => `${c.name} (${c.questionCount} câu hỏi, ${c.studentCount} SV, ${c.openCount} chưa giải đáp)`).join('; ')}
</context>
<posts>
Câu hỏi chưa giải đáp:
${unanswered.map((p) => `[${p.postId}] votes=${p.voteCount}: ${fence(p.content, 300)}`).join('\n')}
Nội dung nhiều SV cần giải thích thêm:
${unclear.map((p) => `[${p.postId}] need_explanation=${p.reactionCounts?.need_explanation}: ${fence(p.content, 300)}`).join('\n')}
</posts>
<activities>
${quizLines.join('\n')}
</activities>`;
  await progress('generate');
  const r = await executeStructured({
    cls,
    user,
    taskType: 'insights',
    jobId: job.jobId,
    sourceRefs: [...unanswered, ...unclear].map((p) => `post:${p.postId}`),
    system: `Bạn hỗ trợ giảng viên đại học phân tích dữ liệu tương tác của lớp để điều chỉnh giảng dạy. Đưa ra 4–10 nhận định thuộc các nhóm: chủ đề có nhiều câu hỏi (topic_questions), khái niệm dễ nhầm lẫn/quiz sai nhiều (misconception), câu hỏi chưa trả lời (unanswered), nội dung cần giảng giải bổ sung (needs_explanation), mức độ tham gia của lớp (participation – chỉ nói về số liệu tổng hợp, không về cá nhân), gợi ý giảng dạy (suggestion). Mỗi nhận định phải có evidence là số liệu cụ thể từ dữ liệu và refs là id bài đăng nếu có. Kèm 3–6 câu hỏi tiếp nối (followUpQuestions) giảng viên có thể dùng ở buổi sau.
Chỉ đưa ra nhận định dựa trên dữ liệu quan sát được. Không suy diễn năng lực, động cơ hay trạng thái tâm lý của sinh viên từ số lượng tin nhắn.
${DATA_GUARD}
${languageLine(job.lang)}`,
    prompt,
    schemaName: 'teaching_insights',
    schema: INSIGHTS_SCHEMA,
    maxOutputTokens: 5000,
  });
  const valid = new Set(posts.map((p) => p.postId));
  const out = r.json as { insights?: InsightItem[]; followUpQuestions?: string[] };
  const doc = {
    classId: cls.classId,
    insights: (out.insights ?? []).slice(0, 12).map((i) => ({
      category: i.category,
      title: String(i.title ?? '').slice(0, 300),
      detail: String(i.detail ?? '').slice(0, 2000),
      evidence: (i.evidence ?? []).slice(0, 6).map((e) => String(e).slice(0, 300)),
      refs: (i.refs ?? []).filter((x) => valid.has(x)).slice(0, 10),
    })),
    followUpQuestions: (out.followUpQuestions ?? []).slice(0, 8).map((q) => String(q).slice(0, 500)),
    lang: job.lang,
    aiRunId: r.runId,
    jobId: job.jobId,
    generatedAt: now(),
    generatedBy: user.uid,
  };
  await C.class(cls.classId).collection('insights').doc('latest').set(doc);
  await C.class(cls.classId).collection('insights').doc(`h_${Date.now()}`).set(doc);
  return { insights: doc.insights.length, runId: r.runId };
});

export const _internal = { greedyClusters };

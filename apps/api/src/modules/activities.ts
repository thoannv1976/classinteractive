import type { FastifyInstance } from 'fastify';
import type { ActivityDoc, ActivityOption, AttendanceDoc, SessionDoc, SubmissionDoc } from '@classinteract/shared';
import {
  UNDERSTANDING_OPTIONS,
  createActivitySchema,
  featureSubmissionSchema,
  submitActivitySchema,
  updateActivitySchema,
} from '@classinteract/shared';
import { db, inc, now } from '../firebase';
import { assertClassWritable, loadClassAccess, requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { assertSessionAccepts, bumpClassStats, bumpSessionStats, prepareParticipation } from '../lib/counters';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';
import { notify } from './notifications';

type Params = { classId: string; sessionId: string; activityId: string };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

async function getActivity(p: Params) {
  const snap = await C.activities(p.classId, p.sessionId).doc(p.activityId).get();
  if (!snap.exists) throw notFound('Không tìm thấy hoạt động');
  return snap.data() as ActivityDoc;
}

/** Opens an activity. The first opening counts as a participation opportunity. */
async function openActivity(p: Params) {
  return db.runTransaction(async (tx) => {
    const ref = C.activities(p.classId, p.sessionId).doc(p.activityId);
    const [snap, sSnap] = await Promise.all([tx.get(ref), tx.get(C.session(p.classId, p.sessionId))]);
    if (!snap.exists) throw notFound('Không tìm thấy hoạt động');
    const s = sSnap.data() as SessionDoc | undefined;
    if (!s || (s.status !== 'open' && s.status !== 'paused')) throw conflict('Chỉ mở hoạt động khi buổi học đang diễn ra');
    const act = snap.data() as ActivityDoc;
    if (act.status === 'open') return false;
    const first = !act.openedAt;
    tx.update(ref, { status: 'open', ...(first ? { openedAt: now() } : {}), closedAt: null, updatedAt: now() });
    if (first) {
      bumpSessionStats(tx, p.classId, p.sessionId, { activityCount: 1 });
      bumpClassStats(tx, p.classId, { activityCount: 1 });
    }
    return true;
  });
}

async function notifyAttendees(p: Params, title: string) {
  const att = await C.attendance(p.classId, p.sessionId).get();
  await notify(
    att.docs.map((d) => (d.data() as AttendanceDoc).uid),
    { type: 'activity_opened', title: 'Hoạt động mới trên lớp', body: title, link: `/classes/${p.classId}/sessions/${p.sessionId}?tab=activities` },
  );
}

export default async function activityRoutes(app: FastifyInstance) {
  app.post('/classes/:classId/sessions/:sessionId/activities', async (req) => {
    const { classId, sessionId } = req.params as Params;
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const input = parse(createActivitySchema, req.body);
    const sSnap = await C.session(classId, sessionId).get();
    if (!sSnap.exists) throw notFound('Không tìm thấy buổi học');
    if ((sSnap.data() as SessionDoc).status === 'archived') throw conflict('Buổi học đã lưu trữ');

    let options: ActivityOption[] = [];
    if (input.type === 'understanding') options = UNDERSTANDING_OPTIONS.map((o) => ({ ...o }));
    else if (input.type === 'poll' || input.type === 'quiz') options = input.options.map((label, i) => ({ id: `o${i + 1}`, label }));
    const correctOptionIds = input.type === 'quiz' ? [...new Set(input.correctOptionIndexes)].map((i) => `o${i + 1}`) : [];
    const allowMultiple = input.type === 'understanding' || input.type === 'free_text' ? false : input.allowMultiple || correctOptionIds.length > 1;

    const ref = C.activities(classId, sessionId).doc();
    const p = { classId, sessionId, activityId: ref.id };
    const batch = db.batch();
    batch.set(ref, {
      activityId: ref.id,
      classId,
      sessionId,
      type: input.type,
      title: input.title,
      prompt: input.prompt,
      options,
      allowMultiple,
      status: 'draft',
      showResults: input.showResults,
      revealedCorrectOptionIds: null,
      openedAt: null,
      closedAt: null,
      createdBy: me.uid,
      createdAt: now(),
      updatedAt: now(),
    });
    batch.set(C.activityResults(classId, sessionId, ref.id), {
      submissionCount: 0,
      optionCounts: Object.fromEntries(options.map((o) => [o.id, 0])),
      correctCount: 0,
      updatedAt: now(),
    });
    // Correct answers live in a document students can never read.
    if (input.type === 'quiz') batch.set(C.activityKey(classId, sessionId, ref.id), { correctOptionIds });
    await batch.commit();
    if (input.openNow) {
      await openActivity(p);
      await notifyAttendees(p, input.title);
    }
    await audit(req, 'activity.create', 'activity', ref.id, { classId, sessionId, type: input.type });
    return { activityId: ref.id };
  });

  app.post('/classes/:classId/sessions/:sessionId/activities/:activityId/open', async (req) => {
    const p = req.params as Params;
    await requireClassModerator(currentUser(req), p.classId);
    const act = await getActivity(p);
    if (await openActivity(p)) await notifyAttendees(p, act.title);
    return { ok: true };
  });

  app.post('/classes/:classId/sessions/:sessionId/activities/:activityId/close', async (req) => {
    const p = req.params as Params;
    await requireClassModerator(currentUser(req), p.classId);
    const act = await getActivity(p);
    if (act.status !== 'open') throw conflict('Hoạt động không ở trạng thái đang mở');
    await C.activities(p.classId, p.sessionId).doc(p.activityId).update({ status: 'closed', closedAt: now(), updatedAt: now() });
    return { ok: true };
  });

  app.patch('/classes/:classId/sessions/:sessionId/activities/:activityId', async (req) => {
    const p = req.params as Params;
    await requireClassModerator(currentUser(req), p.classId);
    const input = parse(updateActivitySchema, req.body);
    const act = await getActivity(p);
    const update: Record<string, unknown> = { updatedAt: now() };
    if (input.showResults !== undefined) update.showResults = input.showResults;
    if (input.revealAnswer !== undefined) {
      if (act.type !== 'quiz') throw badRequest('Chỉ trắc nghiệm mới có đáp án');
      if (input.revealAnswer) {
        const key = (await C.activityKey(p.classId, p.sessionId, p.activityId).get()).data();
        update.revealedCorrectOptionIds = (key?.correctOptionIds as string[]) ?? [];
      } else update.revealedCorrectOptionIds = null;
    }
    await C.activities(p.classId, p.sessionId).doc(p.activityId).update(update);
    return { ok: true };
  });

  app.delete('/classes/:classId/sessions/:sessionId/activities/:activityId', async (req) => {
    const p = req.params as Params;
    await requireClassModerator(currentUser(req), p.classId);
    const act = await getActivity(p);
    const results = (await C.activityResults(p.classId, p.sessionId, p.activityId).get()).data();
    if ((results?.submissionCount ?? 0) > 0 || act.openedAt) throw conflict('Hoạt động đã được mở nên không thể xóa; hãy đóng hoạt động.');
    const batch = db.batch();
    batch.delete(C.activities(p.classId, p.sessionId).doc(p.activityId));
    batch.delete(C.activityResults(p.classId, p.sessionId, p.activityId));
    batch.delete(C.activityKey(p.classId, p.sessionId, p.activityId));
    await batch.commit();
    return { ok: true };
  });

  /** Student submits (or changes) their answer. One submission per student. */
  app.post('/classes/:classId/sessions/:sessionId/activities/:activityId/submissions', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const input = parse(submitActivitySchema, req.body);
    const a = await loadClassAccess(me, p.classId);
    assertClassWritable(a);
    if (me.role !== 'student') throw forbidden('Chỉ sinh viên nộp câu trả lời cho hoạt động');

    return db.runTransaction(async (tx) => {
      const actRef = C.activities(p.classId, p.sessionId).doc(p.activityId);
      const subRef = C.submissions(p.classId, p.sessionId, p.activityId).doc(me.uid);
      const gradeRef = C.grading(p.classId, p.sessionId, p.activityId).doc(me.uid);
      const [actSnap, sSnap, subSnap, keySnap, gradeSnap] = await Promise.all([
        tx.get(actRef),
        tx.get(C.session(p.classId, p.sessionId)),
        tx.get(subRef),
        tx.get(C.activityKey(p.classId, p.sessionId, p.activityId)),
        tx.get(gradeRef),
      ]);
      if (!actSnap.exists) throw notFound('Không tìm thấy hoạt động');
      const act = actSnap.data() as ActivityDoc;
      if (act.status !== 'open') throw conflict('Hoạt động đã đóng hoặc chưa mở', 'ACTIVITY_CLOSED');
      assertSessionAccepts(sSnap.data() as SessionDoc, 'submit');

      let optionIds: string[] = [];
      let text = '';
      if (act.type === 'free_text') {
        text = input.text;
        if (!text) throw badRequest('Hãy nhập câu trả lời');
      } else {
        optionIds = [...new Set(input.optionIds)];
        const valid = new Set(act.options.map((o) => o.id));
        if (!optionIds.length) throw badRequest('Hãy chọn một phương án');
        if (optionIds.some((o) => !valid.has(o))) throw badRequest('Phương án không hợp lệ');
        if (!act.allowMultiple && optionIds.length > 1) throw badRequest('Chỉ được chọn một phương án');
      }
      const old = subSnap.data() as SubmissionDoc | undefined;
      if (old && sameSet(old.optionIds, optionIds) && old.text === text) return { ok: true, changed: false };

      const part = await prepareParticipation(tx, { classId: p.classId, sessionId: p.sessionId, user: me });
      const resultsUpdate: Record<string, unknown> = { updatedAt: now() };
      const oldIds = old?.optionIds ?? [];
      for (const id of oldIds) if (!optionIds.includes(id)) resultsUpdate[`optionCounts.${id}`] = inc(-1);
      for (const id of optionIds) if (!oldIds.includes(id)) resultsUpdate[`optionCounts.${id}`] = inc(1);
      if (!old) resultsUpdate.submissionCount = inc(1);

      let correctDiff = 0;
      if (act.type === 'quiz') {
        const correct = (keySnap.data()?.correctOptionIds as string[]) ?? [];
        const isCorrect = sameSet(optionIds, correct);
        const wasCorrect = gradeSnap.exists ? !!gradeSnap.data()!.isCorrect : false;
        correctDiff = (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0);
        if (correctDiff) resultsUpdate.correctCount = inc(correctDiff);
        tx.set(gradeRef, { uid: me.uid, isCorrect, gradedAt: now() });
      }
      // update() (not set+merge) so that dotted keys address nested optionCounts fields
      tx.update(C.activityResults(p.classId, p.sessionId, p.activityId), resultsUpdate);
      tx.set(subRef, {
        uid: me.uid,
        studentId: me.studentId,
        displayName: me.displayName,
        optionIds,
        text,
        featured: old?.featured ?? false,
        clientRequestId: input.clientRequestId,
        submittedAt: old?.submittedAt ?? now(),
        updatedAt: now(),
      });
      const extra: Record<string, number> = { quizCorrect: correctDiff };
      if (!old) {
        if (act.type === 'poll' || act.type === 'understanding') extra.pollsAnswered = 1;
        if (act.type === 'quiz') extra.quizzesAnswered = 1;
      }
      part.write(old ? {} : { activitiesCompleted: 1 }, {
        sessionDelta: old ? {} : { submissionCount: 1 },
        classDelta: old ? {} : { submissionCount: 1 },
        studentExtra: extra,
      });
      return { ok: true, changed: true };
    });
  });

  app.post('/classes/:classId/sessions/:sessionId/activities/:activityId/submissions/:uid/feature', async (req) => {
    const p = req.params as Params & { uid: string };
    await requireClassModerator(currentUser(req), p.classId);
    const { featured } = parse(featureSubmissionSchema, req.body);
    const ref = C.submissions(p.classId, p.sessionId, p.activityId).doc(p.uid);
    if (!(await ref.get()).exists) throw notFound();
    await ref.update({ featured, updatedAt: now() });
    return { ok: true };
  });

  /** Full results incl. correctness for the lecturer. */
  app.get('/classes/:classId/sessions/:sessionId/activities/:activityId/results', async (req) => {
    const p = req.params as Params;
    await requireClassModerator(currentUser(req), p.classId);
    const [act, results, subs, grades, key] = await Promise.all([
      getActivity(p),
      C.activityResults(p.classId, p.sessionId, p.activityId).get(),
      C.submissions(p.classId, p.sessionId, p.activityId).orderBy('submittedAt').get(),
      C.grading(p.classId, p.sessionId, p.activityId).get(),
      C.activityKey(p.classId, p.sessionId, p.activityId).get(),
    ]);
    const correct = new Map(grades.docs.map((g) => [g.id, !!g.data().isCorrect]));
    return serialize({
      activity: act,
      results: results.data() ?? null,
      correctOptionIds: key.data()?.correctOptionIds ?? [],
      submissions: subs.docs.map((d) => ({ ...(d.data() as SubmissionDoc), isCorrect: correct.get(d.id) ?? null })),
    });
  });
}

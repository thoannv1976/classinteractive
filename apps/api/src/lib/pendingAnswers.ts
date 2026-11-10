import type { AnswerSuggestion, PostDoc } from '@classinteract/shared';
import { db } from '../firebase';
import { C } from './paths';
import { toMillis } from './time';

export type PendingAnswer = PostDoc & {
  question: { postId: string; content: string; authorName: string; status: PostDoc['status'] };
  helpfulScore: number;
};

/** Where the AI's suggestions for answers awaiting confirmation are kept (one map per class). */
export const answerSuggestionsRef = (classId: string) => C.class(classId).collection('aiSuggestions').doc('answers');

export async function loadAnswerSuggestions(classId: string): Promise<Record<string, AnswerSuggestion>> {
  const snap = await answerSuggestionsRef(classId).get();
  return ((snap.data()?.items ?? {}) as Record<string, AnswerSuggestion>);
}

/**
 * Students' visible answers not yet confirmed by the lecturer, with the question they answer.
 * Answers classmates found helpful come first.
 */
export async function loadPendingAnswers(classId: string, sessionId?: string): Promise<PendingAnswer[]> {
  let query = db.collectionGroup('posts').where('classId', '==', classId).where('type', '==', 'answer');
  if (sessionId) query = query.where('sessionId', '==', sessionId);
  const snap = await query.limit(1000).get();
  const answers = snap.docs
    .map((d) => d.data() as PostDoc)
    .filter((p) => p.moderationStatus === 'visible' && !p.isAccepted && p.authorRole === 'student' && p.parentPostId);
  const parentRefs = [...new Map(answers.map((p) => [`${p.sessionId}/${p.parentPostId}`, C.posts(classId, p.sessionId).doc(p.parentPostId!)])).values()];
  const parents = new Map(
    (parentRefs.length ? await db.getAll(...parentRefs) : []).filter((d) => d.exists).map((d) => [`${(d.data() as PostDoc).sessionId}/${d.id}`, d.data() as PostDoc]),
  );
  const score = (p: PostDoc) => (p.reactionCounts?.helpful ?? 0) * 2 + (p.reactionCounts?.agree ?? 0) + (p.reactionCounts?.understood ?? 0);
  const items: PendingAnswer[] = [];
  for (const p of answers) {
    const parent = parents.get(`${p.sessionId}/${p.parentPostId}`);
    if (!parent || parent.moderationStatus !== 'visible') continue;
    items.push({ ...p, question: { postId: parent.postId, content: parent.content, authorName: parent.authorName, status: parent.status }, helpfulScore: score(p) });
  }
  return items.sort((x, y) => y.helpfulScore - x.helpfulScore || (toMillis(y.createdAt) ?? 0) - (toMillis(x.createdAt) ?? 0));
}

import type { PostDoc } from '@classinteract/shared';

/** Pinned first, then newest. Optionally sort by votes ("most wanted"). */
export function sortPosts(posts: PostDoc[], mode: 'new' | 'top') {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (mode === 'top' && a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
    return 0;
  });
}

const STOP = new Set(['là', 'gì', 'của', 'và', 'có', 'không', 'các', 'những', 'cho', 'được', 'trong', 'với', 'thế', 'nào', 'em', 'ạ', 'thầy', 'cô', 'này', 'đó', 'một', 'như', 'khi', 'thì', 'để', 'từ', 'the', 'a', 'is']);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFC')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

/** Lightweight duplicate hint: questions sharing many words with the draft. */
export function similarQuestions(draft: string, posts: PostDoc[], max = 3) {
  const t = tokens(draft);
  if (t.size < 3) return [];
  return posts
    .filter((p) => p.type === 'question')
    .map((p) => {
      const pt = tokens(p.content);
      let common = 0;
      t.forEach((w) => pt.has(w) && common++);
      return { p, score: common / Math.min(t.size, pt.size || 1) };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.p);
}

/**
 * Remembers ids of posts created on this device. Anonymous posts carry no authorId,
 * so this is how the author's own device can still offer edit/delete/ask-AI.
 * The API always re-checks ownership.
 */
const KEY = 'ci:myPosts';

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberMyPost(postId: string) {
  try {
    const ids = [postId, ...load().filter((x) => x !== postId)].slice(0, 500);
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

export const isMyPost = (postId: string) => load().includes(postId);

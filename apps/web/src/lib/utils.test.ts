import { describe, expect, it } from 'vitest';
import type { PostDoc } from '@classinteract/shared';
import { similarQuestions, sortPosts } from '@/components/classroom/postUtils';
import { pct, requestId, toDate } from './utils';

const post = (p: Partial<PostDoc>) => ({ postId: Math.random().toString(), type: 'question', content: '', isPinned: false, voteCount: 0, ...p }) as PostDoc;

describe('utils', () => {
  it('formats rates and keys', () => {
    expect(pct(0.756)).toBe('76%');
    expect(pct(null)).toBe('—');
    expect(requestId()).toMatch(/^[A-Za-z0-9]{8,32}$/);
    expect(toDate({ seconds: 10, nanoseconds: 0 })?.getTime()).toBe(10000);
  });
  it('detects similar questions', () => {
    const posts = [post({ content: 'Shopee kiếm tiền từ những nguồn doanh thu nào?' }), post({ content: 'Network effect là gì?' })];
    expect(similarQuestions('Nguồn doanh thu của Shopee từ đâu?', posts)).toHaveLength(1);
  });
  it('keeps pinned posts first and sorts by votes', () => {
    const r = sortPosts([post({ postId: 'a', voteCount: 5 }), post({ postId: 'b', isPinned: true }), post({ postId: 'c', voteCount: 9 })], 'top');
    expect(r.map((p) => p.postId)).toEqual(['b', 'c', 'a']);
  });
});

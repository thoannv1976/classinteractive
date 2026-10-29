import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import type { ActivityDoc, PostDoc } from '@classinteract/shared';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/firestore';

export const sessionPath = (classId: string, sessionId: string) => `classes/${classId}/sessions/${sessionId}`;

/** Live feed of root posts. Students must filter by visibility (enforced by security rules). */
export function useFeed(classId: string, sessionId: string, staff: boolean, pageSize: number) {
  const q = useMemo(() => {
    const col = collection(db, sessionPath(classId, sessionId), 'posts');
    return staff
      ? query(col, where('isRoot', '==', true), orderBy('createdAt', 'desc'), limit(pageSize))
      : query(col, where('moderationStatus', '==', 'visible'), where('isRoot', '==', true), orderBy('createdAt', 'desc'), limit(pageSize));
  }, [classId, sessionId, staff, pageSize]);
  return useLiveQuery<PostDoc>(q);
}

export function useReplies(classId: string, sessionId: string, postId: string, staff: boolean) {
  const q = useMemo(() => {
    const col = collection(db, sessionPath(classId, sessionId), 'posts');
    return staff
      ? query(col, where('rootPostId', '==', postId), orderBy('createdAt', 'asc'), limit(300))
      : query(col, where('moderationStatus', '==', 'visible'), where('rootPostId', '==', postId), orderBy('createdAt', 'asc'), limit(300));
  }, [classId, sessionId, postId, staff]);
  return useLiveQuery<PostDoc>(q);
}

export function useActivities(classId: string, sessionId: string, staff: boolean) {
  const q = useMemo(() => {
    const col = collection(db, sessionPath(classId, sessionId), 'activities');
    return staff
      ? query(col, orderBy('createdAt', 'desc'), limit(100))
      : query(col, where('status', 'in', ['open', 'closed']), orderBy('createdAt', 'desc'), limit(100));
  }, [classId, sessionId, staff]);
  return useLiveQuery<ActivityDoc>(q);
}

export { similarQuestions, sortPosts } from './postUtils';

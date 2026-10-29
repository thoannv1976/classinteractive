import { useMemo } from 'react';
import type { ClassDoc, PostDoc } from '@classinteract/shared';
import { EmptyState, ListSkeleton } from '@/components/ui/feedback';
import { useLiveDoc } from '@/lib/firestore';
import { ReplyComposer } from './Composer';
import { PostCard } from './PostCard';
import { sessionPath, useReplies } from './hooks';

/** A question (or other root post) with all replies, live. */
export function Thread({
  cls,
  sessionId,
  postId,
  staff,
  canPost,
  disabledReason,
  onAskAi,
  canAskAiAsStudent,
}: {
  cls: ClassDoc;
  sessionId: string;
  postId: string;
  staff: boolean;
  canPost: boolean;
  disabledReason?: string;
  onAskAi?: (p: PostDoc) => void;
  canAskAiAsStudent?: boolean;
}) {
  const root = useLiveDoc<PostDoc>(`${sessionPath(cls.classId, sessionId)}/posts/${postId}`);
  const replies = useReplies(cls.classId, sessionId, postId, staff);
  const sorted = useMemo(
    () =>
      [...replies.data].sort((a, b) => {
        // Accepted / lecturer answers first, then chronological
        const w = (p: PostDoc) => (p.isAccepted ? 2 : p.authorRole === 'lecturer' || (p.isAiGenerated && p.approvedBy) ? 1 : 0);
        return w(b) - w(a);
      }),
    [replies.data],
  );
  if (root.loading) return <ListSkeleton rows={2} />;
  if (!root.data) return <EmptyState title="Không tìm thấy bài đăng" description="Bài có thể đã bị ẩn hoặc xóa." />;
  const common = { classId: cls.classId, sessionId, staff, editWindowMinutes: cls.settings.editWindowMinutes, revealAllowed: cls.settings.revealAnonymousToStaff };
  return (
    <div className="space-y-4">
      <PostCard post={root.data} {...common} onAskAi={onAskAi} canAskAiAsStudent={canAskAiAsStudent} />
      <div className="space-y-3 border-l-2 border-border pl-3 sm:pl-5">
        <p className="text-sm font-medium text-muted">{sorted.length} phản hồi</p>
        {replies.loading ? (
          <ListSkeleton rows={2} />
        ) : (
          sorted.map((r) => <PostCard key={r.postId} post={r} {...common} compact />)
        )}
        <ReplyComposer
          classId={cls.classId}
          sessionId={sessionId}
          postId={postId}
          allowAnonymous={cls.settings.allowAnonymous && !staff}
          disabled={!canPost}
          disabledReason={disabledReason}
        />
      </div>
    </div>
  );
}

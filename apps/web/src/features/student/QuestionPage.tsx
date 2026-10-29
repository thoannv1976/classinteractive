import { useParams } from 'react-router';
import { toast } from 'sonner';
import type { ClassDoc, PostDoc, SessionDoc } from '@classinteract/shared';
import { Thread } from '@/components/classroom/Thread';
import { sessionPath } from '@/components/classroom/hooks';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { useLiveDoc } from '@/lib/firestore';
import { useApi } from '@/lib/query';
import { acceptsPosts } from './LiveSessionPage';
import { sessionLabel } from '../common/SessionStatus';

export function QuestionPage() {
  const { classId = '', sessionId = '', postId = '' } = useParams();
  const meta = useApi<{ class: ClassDoc; access: { canModerate: boolean } }>(`/classes/${classId}/sessions/${sessionId}`);
  const session = useLiveDoc<SessionDoc>(sessionPath(classId, sessionId));
  if (meta.error) return <ErrorState error={meta.error} />;
  if (!meta.data || !session.data) return <Spinner />;
  const cls = meta.data.class;
  const accept = acceptsPosts(session.data);
  const studentAi = cls.settings.aiEnabled && cls.settings.aiMode === 'student_support';
  const ask = async (p: PostDoc) => {
    try {
      await api.post('/ai/answer', { classId, sessionId, postId: p.postId });
      toast.success('AI đã trả lời (có nhãn AI Generated)');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ to: `/classes/${classId}/sessions/${sessionId}`, label: sessionLabel(session.data) }} title="Chi tiết thảo luận" />
      <Thread
        cls={cls}
        sessionId={sessionId}
        postId={postId}
        staff={meta.data.access.canModerate}
        canPost={accept.ok}
        disabledReason={accept.reason}
        canAskAiAsStudent={studentAi}
        onAskAi={studentAi ? ask : undefined}
      />
    </div>
  );
}

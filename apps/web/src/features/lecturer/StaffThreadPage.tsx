import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import type { ClassDoc, PostDoc, SessionDoc } from '@classinteract/shared';
import { AiDraftDialog } from '@/components/classroom/AiDraftDialog';
import { Thread } from '@/components/classroom/Thread';
import { sessionPath } from '@/components/classroom/hooks';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useLiveDoc } from '@/lib/firestore';
import { useApi } from '@/lib/query';
import { sessionLabel } from '../common/SessionStatus';
import { acceptsPosts } from '../student/LiveSessionPage';

export function StaffThreadPage() {
  const { t } = useTranslation();
  const { classId = '', sessionId = '', postId = '' } = useParams();
  const meta = useApi<{ class: ClassDoc }>(`/classes/${classId}/sessions/${sessionId}`);
  const session = useLiveDoc<SessionDoc>(sessionPath(classId, sessionId));
  const [aiPost, setAiPost] = useState<PostDoc | null>(null);
  if (meta.error) return <ErrorState error={meta.error} />;
  if (!meta.data || !session.data) return <Spinner />;
  const s = session.data;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ to: `/teach/classes/${classId}/sessions/${sessionId}`, label: sessionLabel(s) }} title={t('Chi tiết thảo luận')} />
      <Thread
        cls={meta.data.class}
        sessionId={sessionId}
        postId={postId}
        staff
        canPost={acceptsPosts(s).ok}
        disabledReason={acceptsPosts(s).reason}
        onAskAi={meta.data.class.settings.aiEnabled ? setAiPost : undefined}
      />
      <AiDraftDialog open={!!aiPost} onOpenChange={(v) => !v && setAiPost(null)} classId={classId} sessionId={sessionId} post={aiPost} />
    </div>
  );
}

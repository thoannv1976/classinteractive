import { CalendarClock, ChevronDown, ChevronUp, PlayCircle, Rocket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ScoreConfig, SessionDoc } from '@classinteract/shared';
import { SCORE_COMPONENTS, SCORE_COMPONENT_LABELS } from '@classinteract/shared';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/lib/query';
import { toDate } from '@/lib/utils';
import { sessionLabel, sessionTime } from '../common/SessionStatus';

const storageKey = (classId: string) => `ci.startGuide.collapsed.${classId}`;
const readCollapsed = (classId: string) => {
  try {
    return localStorage.getItem(storageKey(classId)) === '1';
  } catch {
    return false;
  }
};

/**
 * First thing a student sees in a class (most arrive from Moodle and do not know what to do):
 * the session to join now, four steps, and how the participation score is earned.
 * Collapsible; the choice is remembered per class on this device.
 */
export function StartGuide({ classId, sessions }: { classId: string; sessions: SessionDoc[] }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(classId));
  // Weights and caps, when the class shows scores to students (403 otherwise → generic text).
  const score = useApi<{ config: ScoreConfig }>(`/classes/${classId}/scores/me`, { retry: false });
  const cfg = score.data?.config;

  const live = sessions
    .filter((s) => s.status === 'open' || s.status === 'paused')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || (toDate(b.startedAt)?.getTime() ?? 0) - (toDate(a.startedAt)?.getTime() ?? 0));

  // Next planned session (not started yet), so students know when to come back.
  const today = new Date().toISOString().slice(0, 10);
  const next = sessions
    .filter((s) => s.status === 'draft' && s.date >= today)
    .sort((a, b) => `${a.date}T${a.plannedStart}`.localeCompare(`${b.date}T${b.plannedStart}`))[0];

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey(classId), next ? '1' : '0');
    } catch {
      /* private mode – just not remembered */
    }
  };

  return (
    <Card className="border-primary/30 bg-primary-soft/40">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <Rocket className="h-5 w-5 text-primary" /> {t('Bắt đầu từ đây')}
          </p>
          <button type="button" onClick={toggle} className="flex items-center gap-1 text-xs font-medium text-primary" aria-expanded={!collapsed}>
            {collapsed ? <><ChevronDown className="h-4 w-4" /> {t('Xem hướng dẫn')}</> : <><ChevronUp className="h-4 w-4" /> {t('Thu gọn')}</>}
          </button>
        </div>

        {live.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {live.map((s, i) => (
              <Link
                key={s.sessionId}
                to={`/classes/${classId}/sessions/${s.sessionId}`}
                className={buttonVariants({ variant: i === 0 ? 'primary' : 'outline', size: i === 0 ? 'md' : 'sm' })}
              >
                <PlayCircle className="h-4 w-4" /> {i === 0 ? t('Vào buổi đang diễn ra: {{name}}', { name: sessionLabel(s) }) : sessionLabel(s)}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('Hiện chưa có buổi học nào đang mở. Khi giảng viên mở buổi, nút vào buổi sẽ hiện ở đây; bạn vẫn có thể xem lại hỏi đáp của các buổi trước ở danh sách bên dưới.')}</p>
        )}
        {next && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="font-medium">{t('Buổi tới:')}</span> {sessionLabel(next)} <span className="text-muted">· {sessionTime(next)}</span>
          </p>
        )}

        {!collapsed && (
          <>
            <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                [t('Vào buổi học'), t('Bấm nút vào buổi đang diễn ra. Hệ thống tự điểm danh khi bạn mở buổi.')],
                [t('Làm hoạt động'), t('Mở tab "Hoạt động" để trả lời thăm dò, câu hỏi nhanh và phiếu cuối buổi khi giảng viên mở.')],
                [t('Hỏi và trả lời'), t('Ở tab "Hỏi đáp", đặt câu hỏi về bài học và trả lời, bình luận câu hỏi của bạn khác.')],
                [t('Theo dõi điểm'), t('Bấm "Mức độ tham gia của tôi" để xem mình đã làm gì và còn thiếu gì để tăng điểm.')],
              ].map(([title, body], i) => (
                <li key={i} className="rounded-lg bg-surface p-3 shadow-sm">
                  <p className="font-semibold">
                    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">{i + 1}</span>
                    {title}
                  </p>
                  <p className="mt-1 text-muted">{body}</p>
                </li>
              ))}
            </ol>
            <div className="rounded-lg bg-surface p-3 text-sm shadow-sm">
              <p className="mb-1.5 font-semibold">{t('Điểm tham gia được tính từ 5 việc')}</p>
              <ul className="grid gap-1 text-muted sm:grid-cols-2">
                {SCORE_COMPONENTS.map((k) => (
                  <li key={k}>
                    • {t(SCORE_COMPONENT_LABELS[k])}
                    {cfg && ` (${cfg.weights[k]}%)`}
                  </li>
                ))}
              </ul>
              {cfg && (
                <p className="mt-2 text-xs text-muted">
                  {t('Mỗi buổi tính tối đa {{q}} câu hỏi, {{a}} lần trả lời/thảo luận và {{h}} câu trả lời được giảng viên xác nhận. Buổi đã qua không làm bù được, nên hãy tham gia đều ở mọi buổi.', { q: cfg.caps.questions, a: cfg.caps.answers, h: cfg.caps.helpful })}
                </p>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

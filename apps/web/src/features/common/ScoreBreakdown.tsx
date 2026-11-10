import { Check, Info, Lightbulb, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScoreComponent, ScoreConfig, Time } from '@classinteract/shared';
import { SCORE_COMPONENTS, SCORE_COMPONENT_LABELS, scoreTips } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/misc';
import { tk } from '@/i18n';
import { cn, formatDateTime } from '@/lib/utils';

export interface ScoreDetail {
  config: ScoreConfig;
  sessionsHeld: number;
  row: {
    components: Record<ScoreComponent, { value: number | null; done: number; possible: number }>;
    raw: number | null;
    adjustment: number;
    score: number | null;
    sessionsCounted: number;
    adjustmentNote?: string;
    excluded?: boolean;
  };
  sessions: Array<{ sessionId: string; sessionNumber: number; title: string; startedAt: Time | null; joined: boolean; questions: number; contributions: number }>;
}

/** What to do to fill each score component, in the student's voice (the lecturer can pass it on as is). */
const TIP_TEXT: Record<ScoreComponent, string> = {
  activities: tk('Làm đủ các hoạt động giảng viên mở trong buổi học (thăm dò, câu hỏi nhanh, kiểm tra mức hiểu bài). Bạn đã làm {{done}}/{{possible}}.'),
  answers: tk('Trả lời, bình luận hoặc thảo luận câu hỏi của bạn khác: mỗi buổi được tính tối đa {{cap}} lần. Bạn đang có {{done}}/{{possible}}.'),
  questions: tk('Đặt câu hỏi liên quan đến bài học: mỗi buổi được tính tối đa {{cap}} câu. Bạn đang có {{done}}/{{possible}}.'),
  helpful: tk('Trả lời câu hỏi của bạn khác thật kỹ để giảng viên xác nhận là câu trả lời đúng: mỗi buổi được tính tối đa {{cap}} câu. Bạn đang có {{done}}/{{possible}}.'),
  exitTickets: tk('Nộp phiếu cuối buổi mỗi khi giảng viên mở. Bạn đã nộp {{done}}/{{possible}}.'),
};

const capOf = (cfg: ScoreConfig, k: ScoreComponent) => (k === 'answers' ? cfg.caps.answers : k === 'questions' ? cfg.caps.questions : k === 'helpful' ? cfg.caps.helpful : null);

/**
 * The engagement score of one student: total, the five components, where points are being lost
 * and a session-by-session view. Used by the student (own score) and the lecturer (any student).
 */
export function ScoreBreakdown({ data, audience }: { data: ScoreDetail; audience: 'student' | 'lecturer' }) {
  const { t } = useTranslation();
  const { row, config, sessions } = data;
  const tips = scoreTips(config, row);
  return (
    <Card className="mb-6">
      <CardHeader
        title={audience === 'student' ? t('Điểm tham khảo') : t('Điểm tham gia')}
        description={t('Điểm tham gia (0–100) tính trên {{n}} buổi học đã diễn ra', { n: row.sessionsCounted })}
        actions={
          <>
            {row.excluded && <Badge tone="warning">{t('Không tính điểm')}</Badge>}
            <Badge tone="neutral">{t('Phiên bản công thức {{v}}', { v: config.version })}</Badge>
          </>
        }
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-semibold tabular-nums">{row.score === null ? '—' : row.score.toFixed(1)}</p>
          <p className="pb-1 text-sm text-muted">
            {row.score === null
              ? t('Chưa có cơ hội tham gia nào được tính')
              : row.adjustment
                ? t('Theo công thức {{raw}}, điều chỉnh của giảng viên {{adj}}', { raw: row.raw?.toFixed(1) ?? '—', adj: `${row.adjustment > 0 ? '+' : ''}${row.adjustment}` })
                : t('trên 100')}
          </p>
          {audience === 'lecturer' && row.adjustmentNote && <p className="pb-1 text-sm text-muted">· {row.adjustmentNote}</p>}
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SCORE_COMPONENTS.map((k) => {
            const c = row.components[k];
            return (
              <li key={k} className={cn('rounded-lg border border-border p-3', c.value === null && 'opacity-60')}>
                <p className="text-xs text-muted">{t(SCORE_COMPONENT_LABELS[k])}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{c.value === null ? '—' : `${Math.round(c.value * 100)}%`}</p>
                <p className="text-xs text-muted">
                  {c.possible > 0 ? t('{{done}}/{{possible}} · trọng số {{w}}%', { done: c.done, possible: c.possible, w: config.weights[k] }) : t('Chưa có cơ hội – không tính')}
                </p>
                {c.value !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(c.value * 100)}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Lightbulb className="h-4 w-4" /> {audience === 'student' ? t('Cách tăng điểm') : t('Sinh viên cần làm gì để tăng điểm')}
          </h3>
          {!tips.length ? (
            <p className="text-sm text-amber-900">{row.score === null ? t('Chưa có buổi học nào được tính điểm.') : t('Đã đạt tối đa ở mọi phần đang được tính. Hãy giữ nhịp này ở các buổi sau.')}</p>
          ) : (
            <ol className="space-y-2 text-sm text-amber-950">
              {tips.map((tip) => (
                <li key={tip.component} className="flex gap-2">
                  <Badge tone="warning" className="mt-0.5 shrink-0">{t('thiếu {{gain}} điểm', { gain: tip.gain })}</Badge>
                  <span>
                    <strong>{t(SCORE_COMPONENT_LABELS[tip.component])}:</strong>{' '}
                    {t(TIP_TEXT[tip.component], { done: tip.done, possible: tip.possible, cap: capOf(config, tip.component) })}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-900/80">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('Mỗi buổi chỉ tính trong buổi đó, các buổi đã qua không làm bù được. Tham gia đủ ở mỗi buổi tiếp theo sẽ kéo điểm lên dần.')}
          </p>
        </section>

        {sessions.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('Theo từng buổi học')}</h3>
            <Table>
              <thead>
                <tr>
                  <Th>{t('Buổi học')}</Th>
                  <Th className="text-center">{t('Có mặt')}</Th>
                  <Th className="text-right">{t('Đặt câu hỏi')}</Th>
                  <Th className="text-right">{t('Trả lời/thảo luận')}</Th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId}>
                    <Td>
                      <span className="font-medium">{t('Buổi {{n}}', { n: s.sessionNumber })}</span> <span className="text-muted">{s.title}</span>
                      {s.startedAt && <span className="block text-xs text-muted">{formatDateTime(s.startedAt)}</span>}
                    </Td>
                    <Td className="text-center">{s.joined ? <Check className="mx-auto h-4 w-4 text-success" aria-label={t('Có')} /> : <X className="mx-auto h-4 w-4 text-danger" aria-label={t('Không')} />}</Td>
                    <Td className={cn('text-right tabular-nums', s.questions < config.caps.questions && 'text-danger')}>
                      {Math.min(s.questions, config.caps.questions)}/{config.caps.questions}
                    </Td>
                    <Td className={cn('text-right tabular-nums', s.contributions < config.caps.answers && 'text-danger')}>
                      {Math.min(s.contributions, config.caps.answers)}/{config.caps.answers}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        )}
      </CardBody>
    </Card>
  );
}

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { ChevronUp, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { ActivityDoc, ActivityResultsDoc, PostDoc, SessionDoc, SessionStatsDoc, SubmissionDoc } from '@classinteract/shared';
import { ACTIVITY_TYPE_LABELS } from '@classinteract/shared';
import { ResultBars } from '@/components/classroom/Activities';
import { sessionPath, useActivities, useFeed } from '@/components/classroom/hooks';
import { Spinner } from '@/components/ui/feedback';
import { db } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { sessionLabel } from '../common/SessionStatus';
import { joinUrl } from './SessionControlPage';

type View = 'join' | 'questions' | 'activity' | 'unclear';

/**
 * Presenter mode for the classroom screen. Shows no personal information:
 * no author names, no student IDs, only content that is visible to the class.
 */
export function PresenterPage() {
  const { classId = '', sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const session = useLiveDoc<SessionDoc>(sessionPath(classId, sessionId));
  const stats = useLiveDoc<SessionStatsDoc>(`${sessionPath(classId, sessionId)}/stats/summary`);
  const feed = useFeed(classId, sessionId, true, 100);
  const acts = useActivities(classId, sessionId, true);
  const [view, setView] = useState<View>(params.get('activity') ? 'activity' : 'join');
  const [activityId, setActivityId] = useState<string | null>(params.get('activity'));
  const s = session.data;

  const visible = feed.data.filter((p) => p.moderationStatus === 'visible');
  const topQuestions = [...visible].filter((p) => p.type === 'question').sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.voteCount - a.voteCount).slice(0, 6);
  const unclear = [...visible].filter((p) => (p.reactionCounts?.need_explanation ?? 0) > 0 || p.status === 'need_clarification').sort((a, b) => (b.reactionCounts?.need_explanation ?? 0) - (a.reactionCounts?.need_explanation ?? 0)).slice(0, 6);
  const activity = acts.data.find((a) => a.activityId === activityId) ?? acts.data.find((a) => a.status === 'open') ?? acts.data[0] ?? null;

  if (!s) return <Spinner />;
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 px-8 py-4">
        <div>
          <p className="text-sm text-slate-400">ClassInteract AI</p>
          <h1 className="text-2xl font-semibold">{sessionLabel(s)}</h1>
        </div>
        <nav className="flex gap-1 rounded-xl bg-white/10 p-1 text-sm">
          {([
            ['join', 'Tham gia'],
            ['questions', 'Câu hỏi'],
            ['activity', 'Hoạt động'],
            ['unclear', 'Chưa hiểu'],
          ] as [View, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={cn('rounded-lg px-4 py-2 font-medium', view === k ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white')}>
              {l}
            </button>
          ))}
        </nav>
        <button onClick={() => window.close()} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Đóng">
          <X className="h-6 w-6" />
        </button>
      </header>
      <main className="flex flex-1 items-center justify-center px-8 pb-10">
        {view === 'join' && (
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-20">
            {s.joinCode && s.status !== 'closed' ? (
              <>
                <div className="rounded-3xl bg-white p-6">
                  <QRCodeSVG value={joinUrl(s.joinCode)} size={340} level="M" />
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-2xl text-slate-300">Quét QR hoặc vào</p>
                  <p className="mt-2 text-3xl font-medium">{location.host}/join</p>
                  <p className="mt-8 text-2xl text-slate-300">Mã tham gia</p>
                  <p className="font-mono text-8xl font-bold tracking-[0.15em] text-orange-400">{s.joinCode}</p>
                  <p className="mt-8 text-2xl text-slate-300">{stats.data?.attendeeCount ?? 0} sinh viên đã tham gia</p>
                </div>
              </>
            ) : (
              <p className="text-3xl text-slate-300">Buổi học chưa mở hoặc đã kết thúc.</p>
            )}
          </div>
        )}
        {view === 'questions' && <QuestionWall posts={topQuestions} empty="Chưa có câu hỏi" />}
        {view === 'unclear' && <QuestionWall posts={unclear} empty="Chưa có nội dung sinh viên đánh dấu cần giải thích" showNeed />}
        {view === 'activity' && (
          <div className="w-full max-w-5xl">
            {acts.data.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {acts.data.filter((a) => a.status !== 'draft').map((a) => (
                  <button key={a.activityId} onClick={() => setActivityId(a.activityId)} className={cn('rounded-full px-4 py-1.5 text-sm', activity?.activityId === a.activityId ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300')}>
                    {a.title.slice(0, 40)}
                  </button>
                ))}
              </div>
            )}
            {activity ? <ActivityBoard classId={classId} sessionId={sessionId} activity={activity} /> : <p className="text-center text-3xl text-slate-300">Chưa có hoạt động</p>}
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionWall({ posts, empty, showNeed }: { posts: PostDoc[]; empty: string; showNeed?: boolean }) {
  if (!posts.length) return <p className="text-3xl text-slate-300">{empty}</p>;
  return (
    <ul className="grid w-full max-w-6xl gap-5 md:grid-cols-2">
      {posts.map((p) => (
        <li key={p.postId} className={cn('rounded-2xl bg-white/10 p-6', p.isPinned && 'ring-2 ring-orange-400')}>
          <p className="text-2xl leading-snug">{p.content}</p>
          <div className="mt-4 flex gap-4 text-lg text-slate-300">
            <span className="flex items-center gap-1"><ChevronUp className="h-6 w-6" /> {p.voteCount}</span>
            {showNeed && <span>❓ {p.reactionCounts?.need_explanation ?? 0} cần giải thích</span>}
            <span>💬 {p.replyCount}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityBoard({ classId, sessionId, activity }: { classId: string; sessionId: string; activity: ActivityDoc }) {
  const base = `${sessionPath(classId, sessionId)}/activities/${activity.activityId}`;
  const results = useLiveDoc<ActivityResultsDoc>(`${base}/results/summary`);
  const featuredQ = useMemo(
    () => (activity.type === 'free_text' ? query(collection(db, base, 'submissions'), where('featured', '==', true), orderBy('updatedAt', 'desc'), limit(8)) : null),
    [activity.type, base],
  );
  const featured = useLiveQuery<SubmissionDoc>(featuredQ);
  return (
    <div className="rounded-3xl bg-white p-10 text-slate-900">
      <p className="text-lg font-medium text-blue-700">{ACTIVITY_TYPE_LABELS[activity.type]}</p>
      <h2 className="mt-1 text-4xl font-semibold">{activity.title}</h2>
      {activity.prompt && <p className="mt-3 whitespace-pre-wrap text-xl text-slate-600">{activity.prompt}</p>}
      <div className="mt-8">
        {activity.type === 'free_text' ? (
          featured.data.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {featured.data.map((f) => (
                <li key={f.uid} className="rounded-xl bg-amber-50 p-5 text-xl">{f.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-2xl text-slate-500">{results.data?.submissionCount ?? 0} câu trả lời · đánh dấu sao để hiển thị câu trả lời tiêu biểu</p>
          )
        ) : (
          <ResultBars activity={activity} results={results.data} large />
        )}
      </div>
    </div>
  );
}

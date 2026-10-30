import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '@classinteract/shared';
import { isAdminRole } from '@classinteract/shared';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import { ForceChangePassword } from '@/features/auth/ForceChangePassword';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { NotificationsPage } from '@/features/common/NotificationsPage';
import { ProfilePage } from '@/features/common/ProfilePage';
import { ClassDetailPage } from '@/features/student/ClassDetailPage';
import { ClassesPage } from '@/features/student/ClassesPage';
import { StudentSessionPage } from '@/features/student/LiveSessionPage';
import { ParticipationPage } from '@/features/student/ParticipationPage';
import { QuestionPage } from '@/features/student/QuestionPage';
import { SessionTabPage } from '@/features/student/SessionTabPage';
import { StudentHome } from '@/features/student/StudentHome';

const AdminDashboard = lazy(() =>
  import('@/features/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const AiConfigPage = lazy(() =>
  import('@/features/admin/AiConfigPage').then((m) => ({ default: m.AiConfigPage })),
);
const AuditLogsPage = lazy(() =>
  import('@/features/admin/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })),
);
const ClassesAdminPage = lazy(() =>
  import('@/features/admin/ClassesAdminPage').then((m) => ({ default: m.ClassesAdminPage })),
);
const UserDetailPage = lazy(() =>
  import('@/features/admin/UserDetailPage').then((m) => ({ default: m.UserDetailPage })),
);
const UsersPage = lazy(() => import('@/features/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const AnalyticsPage = lazy(() =>
  import('@/features/lecturer/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const ClassLayout = lazy(() =>
  import('@/features/lecturer/ClassLayout').then((m) => ({ default: m.ClassLayout })),
);
const ClassOverviewPage = lazy(() =>
  import('@/features/lecturer/ClassOverviewPage').then((m) => ({ default: m.ClassOverviewPage })),
);
const ClassSettingsPage = lazy(() =>
  import('@/features/lecturer/ClassSettingsPage').then((m) => ({ default: m.ClassSettingsPage })),
);
const PresenterPage = lazy(() =>
  import('@/features/lecturer/PresenterPage').then((m) => ({ default: m.PresenterPage })),
);
const QuestionsQueuePage = lazy(() =>
  import('@/features/lecturer/QuestionsQueuePage').then((m) => ({ default: m.QuestionsQueuePage })),
);
const ReportsPage = lazy(() =>
  import('@/features/lecturer/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const SessionControlPage = lazy(() =>
  import('@/features/lecturer/SessionControlPage').then((m) => ({ default: m.SessionControlPage })),
);
const SessionsPage = lazy(() =>
  import('@/features/lecturer/SessionsPage').then((m) => ({ default: m.SessionsPage })),
);
const StaffThreadPage = lazy(() =>
  import('@/features/lecturer/StaffThreadPage').then((m) => ({ default: m.StaffThreadPage })),
);
const StudentDetailPage = lazy(() =>
  import('@/features/lecturer/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })),
);
const StudentsPage = lazy(() =>
  import('@/features/lecturer/StudentsPage').then((m) => ({ default: m.StudentsPage })),
);
const TeachClassesPage = lazy(() =>
  import('@/features/lecturer/TeachClassesPage').then((m) => ({ default: m.TeachClassesPage })),
);
const TeachDashboard = lazy(() =>
  import('@/features/lecturer/TeachDashboard').then((m) => ({ default: m.TeachDashboard })),
);
const TopicsPage = lazy(() =>
  import('@/features/lecturer/TopicsPage').then((m) => ({ default: m.TopicsPage })),
);
const MyClassParticipationPage = lazy(() =>
  import('@/features/student/MyClassParticipationPage').then((m) => ({
    default: m.MyClassParticipationPage,
  })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const loc = useLocation();
  if (status === 'loading')
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (status === 'signedOut' || !user)
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.mustChangePassword) return <ForceChangePassword />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user || !roles.includes(user.role))
    return (
      <EmptyState
        title={t('Bạn không có quyền truy cập trang này')}
        description={t('Trang này dành cho vai trò khác.')}
      />
    );
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading')
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (status === 'signedIn' && user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'student') return <Navigate to="/home" replace />;
  if (isAdminRole(user.role)) return <Navigate to="/admin" replace />;
  return <Navigate to="/teach" replace />;
}

const STAFF: UserRole[] = ['lecturer', 'admin', 'superadmin'];
const ADMINS: UserRole[] = ['admin', 'superadmin'];

export function App() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomeRedirect />} />
          {/* Student */}
          <Route
            path="home"
            element={
              <RequireRole roles={['student']}>
                <StudentHome />
              </RequireRole>
            }
          />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:classId" element={<ClassDetailPage />} />
          <Route path="classes/:classId/sessions/:sessionId" element={<StudentSessionPage />} />
          <Route path="classes/:classId/sessions/:sessionId/posts/:postId" element={<QuestionPage />} />
          <Route path="session" element={<SessionTabPage />} />
          <Route path="join" element={<SessionTabPage />} />
        <Route path="join/:code" element={<SessionTabPage />} />
          <Route path="participation" element={<ParticipationPage />} />
          <Route path="participation/:classId" element={<MyClassParticipationPage />} />
          {/* Common */}
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          {/* Lecturer */}
          <Route
            path="teach"
            element={
              <RequireRole roles={STAFF}>
                <TeachDashboard />
              </RequireRole>
            }
          />
          <Route
            path="teach/classes"
            element={
              <RequireRole roles={STAFF}>
                <TeachClassesPage />
              </RequireRole>
            }
          />
          <Route path="teach/classes/:classId/sessions/:sessionId" element={<SessionControlPage />} />
          <Route
            path="teach/classes/:classId/sessions/:sessionId/posts/:postId"
            element={<StaffThreadPage />}
          />
          <Route path="teach/classes/:classId" element={<ClassLayout />}>
            <Route index element={<ClassOverviewPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="questions" element={<QuestionsQueuePage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="analytics/students/:uid" element={<StudentDetailPage />} />
            <Route path="topics" element={<TopicsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<ClassSettingsPage />} />
          </Route>
          <Route path="present/:classId/:sessionId" element={<PresenterPage />} />
          {/* Admin */}
          <Route
            path="admin"
            element={
              <RequireRole roles={ADMINS}>
                <AdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="admin/users"
            element={
              <RequireRole roles={ADMINS}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/users/:uid"
            element={
              <RequireRole roles={ADMINS}>
                <UserDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/classes"
            element={
              <RequireRole roles={ADMINS}>
                <ClassesAdminPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/ai"
            element={
              <RequireRole roles={ADMINS}>
                <AiConfigPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/audit"
            element={
              <RequireRole roles={ADMINS}>
                <AuditLogsPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<EmptyState title={t('Không tìm thấy trang')} />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

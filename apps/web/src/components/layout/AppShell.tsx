import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Radio,
  ScrollText,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { ClassDoc, NotificationDoc } from '@classinteract/shared';
import { ROLE_LABELS, isAdminRole } from '@classinteract/shared';
import { Avatar } from '@/components/ui/misc';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useAuth, useMe } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/firestore';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

function useNav(): { main: NavItem[]; mobile: NavItem[] } {
  const me = useMe();
  return useMemo(() => {
    const i = (C: typeof Home) => <C className="h-5 w-5" aria-hidden />;
    if (me.role === 'student') {
      const main = [
        { to: '/home', label: 'Trang chủ', icon: i(Home) },
        { to: '/classes', label: 'Lớp học', icon: i(BookOpen) },
        { to: '/session', label: 'Buổi học', icon: i(Radio) },
        { to: '/participation', label: 'Tham gia của tôi', icon: i(BarChart3) },
        { to: '/notifications', label: 'Thông báo', icon: i(Bell) },
        { to: '/profile', label: 'Hồ sơ', icon: i(User) },
      ];
      return { main, mobile: main.filter((n) => n.to !== '/participation') };
    }
    const teach: NavItem[] = [
      { to: '/teach', label: 'Tổng quan', icon: i(LayoutDashboard), end: true },
      { to: '/teach/classes', label: 'Lớp giảng dạy', icon: i(GraduationCap) },
    ];
    const admin: NavItem[] = isAdminRole(me.role)
      ? [
          { to: '/admin', label: 'Quản trị', icon: i(Settings), end: true },
          { to: '/admin/users', label: 'Người dùng', icon: i(Users) },
          { to: '/admin/classes', label: 'Lớp & học phần', icon: i(BookOpen) },
          { to: '/admin/ai', label: 'Cấu hình AI', icon: i(Bot) },
          { to: '/admin/audit', label: 'Nhật ký', icon: i(ScrollText) },
        ]
      : [];
    const common: NavItem[] = [
      { to: '/notifications', label: 'Thông báo', icon: i(Bell) },
      { to: '/profile', label: 'Hồ sơ', icon: i(User) },
    ];
    const main = [...(isAdminRole(me.role) ? admin : []), ...teach, ...common];
    const mobile = isAdminRole(me.role)
      ? [admin[0]!, admin[1]!, teach[1]!, common[0]!, common[1]!]
      : [teach[0]!, teach[1]!, common[0]!, common[1]!];
    return { main, mobile };
  }, [me.role]);
}

export function useUnreadCount() {
  const me = useMe();
  const q = useMemo(
    () => query(collection(db, 'users', me.uid, 'notifications'), where('read', '==', false), orderBy('createdAt', 'desc'), limit(50)),
    [me.uid],
  );
  return useLiveQuery<NotificationDoc>(q).data.length;
}

function SidebarClasses() {
  const me = useMe();
  const { data } = useApi<{ items: ClassDoc[] }>('/classes');
  const items = (data?.items ?? []).filter((c) => c.status !== 'archived').slice(0, 12);
  if (!items.length) return null;
  const base = me.role === 'student' ? '/classes' : '/teach/classes';
  return (
    <div className="mt-6">
      <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">{me.role === 'student' ? 'Lớp của tôi' : 'Lớp phụ trách'}</p>
      <nav className="mt-2 space-y-0.5" aria-label="Danh sách lớp">
        {items.map((c) => (
          <NavLink
            key={c.classId}
            to={`${base}/${c.classId}`}
            className={({ isActive }) =>
              cn('block truncate rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100', isActive && 'bg-slate-100 font-medium text-fg')
            }
          >
            <span className="font-medium">{c.classCode}</span> <span className="text-muted">· {c.courseName}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AppShell() {
  const me = useMe();
  const { logout } = useAuth();
  const { main, mobile } = useNav();
  const unread = useUnreadCount();
  const loc = useLocation();
  const navigate = useNavigate();
  const immersive = loc.pathname.startsWith('/present/');
  if (immersive) return <Outlet />;

  const badge = (n: NavItem) =>
    n.to === '/notifications' && unread > 0 ? (
      <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>
    ) : null;

  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex print:hidden">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold leading-tight">ClassInteract AI</p>
            <p className="text-[11px] text-muted">Smart Classroom Engagement</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          <nav className="space-y-0.5" aria-label="Điều hướng chính">
            {main.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-fg',
                    isActive && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
                  )
                }
              >
                {n.icon}
                {n.label}
                {badge(n)}
              </NavLink>
            ))}
          </nav>
          <SidebarClasses />
        </div>
        <div className="border-t border-border p-3">
          <Menu
            align="start"
            trigger={
              <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100">
                <Avatar name={me.displayName} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{me.displayName}</span>
                  <span className="block truncate text-xs text-muted">{me.studentId ?? me.email} · {ROLE_LABELS[me.role]}</span>
                </span>
              </button>
            }
          >
            <MenuItem onSelect={() => navigate('/profile')}>
              <User className="h-4 w-4" /> Hồ sơ & mật khẩu
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => void logout()}>
              <LogOut className="h-4 w-4" /> Đăng xuất
            </MenuItem>
          </Menu>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden print:hidden">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-sm font-semibold">ClassInteract AI</span>
        </div>
        <button onClick={() => void logout()} className="rounded-lg p-2 text-muted hover:bg-slate-100" aria-label="Đăng xuất">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur safe-bottom lg:hidden print:hidden"
        aria-label="Điều hướng"
      >
        {mobile.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted', isActive && 'text-primary')
            }
          >
            {n.icon}
            <span className="max-w-full truncate px-1">{n.label}</span>
            {n.to === '/notifications' && unread > 0 && (
              <span className="absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full bg-accent" aria-label={`${unread} thông báo chưa đọc`} />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

import type { ReactNode } from 'react';
import { can, firstName, initials, notificationService, PRODUCT_NAME, PRODUCT_SUBTITLE } from '@snoopy/shared';
import type { Session } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';
import { Breadcrumb, SidebarNav, type NavGroup } from './SidebarNav';
import { Notifications } from './Notifications';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { SnoopyMark } from './Snoopy';

/**
 * Navigation is derived from the capability system rather than from ad-hoc
 * role checks scattered through components. Hiding a link is a UX decision;
 * the matching routes guard themselves and RLS guards the data.
 */
function navFor(session: Session): NavGroup[] {
  const { role } = session.profile;
  const p = session.platform;
  const grants = session.permissions;

  const groups: NavGroup[] = [
    {
      group: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { href: '/courses', label: 'Courses', icon: 'course' },
        { href: '/tasks', label: 'Tasks', icon: 'task' },
        { href: '/events', label: 'Events', icon: 'event' },
        { href: '/documents', label: 'Documents', icon: 'document' },
        { href: '/onboarding', label: 'Onboarding', icon: 'onboarding' },
      ],
    },
    {
      group: 'Manage',
      items: [
        // First in the group, because it is the answer to the question somebody
        // opens this section to ask.
        { href: '/worklist', label: 'What needs you', icon: 'activity' },
        // Only rendered for people who actually manage someone — the page is
        // empty otherwise, and an empty page in the sidebar is noise.
        session.hasReports ? { href: '/team', label: 'My team', icon: 'employees' } : null,
        can('employee.view_all', role, p, grants) ? { href: '/employees', label: 'Employees', icon: 'employees' } : null,
        can('department.view', role, p, grants) ? { href: '/departments', label: 'Departments', icon: 'departments' } : null,
        can('analytics.view_full', role, p, grants) ? { href: '/analytics', label: 'Analytics', icon: 'analytics' } : null,
        can('report.view_full', role, p, grants) ? { href: '/reports', label: 'Reports', icon: 'reports' } : null,
        can('analytics.view_full', role, p, grants) ? { href: '/activity', label: 'Activity', icon: 'activity' } : null,
      ].filter(Boolean) as NavGroup['items'],
    },
    {
      group: 'Account',
      items: ([
        { href: '/profile', label: 'Profile', icon: 'profile' },
        // Roles live inside Settings, reached from the "Users and roles" card
        // there. A second top-level entry for a page that is already a child of
        // Settings makes the sidebar claim two destinations for one idea.
        { href: '/settings', label: 'Settings', icon: 'settings' },
      ].filter(Boolean) as NavGroup['items']),
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}

export async function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const groups = navFor(session);
  const db = await getServerSupabase();
  const [notifications, unread] = await Promise.all([
    notificationService.list(db, session.userId, 20),
    notificationService.unreadCount(db, session.userId),
  ]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <SnoopyMark />
          <div>
            <strong>{PRODUCT_NAME}</strong>
            <span>{PRODUCT_SUBTITLE}</span>
          </div>
        </div>

        <SidebarNav groups={groups} />

        <div className="sidebar-footer">
          <div className="row">
            <span className="avatar" aria-hidden>{initials(session.profile.name)}</span>
            <div className="who" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{firstName(session.profile.name)}</div>
              <div className="subtle" style={{ fontSize: 11 }}>
                {session.profile.role_profile?.name ?? session.profile.job_title ?? 'Employee'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Breadcrumb groups={groups} />
          <div className="row">
            <span className="badge">{session.profile.role_profile?.name ?? (session.profile.role === 'admin' ? 'Admin' : 'Employee')}</span>
            <Notifications initial={notifications} unread={unread} />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

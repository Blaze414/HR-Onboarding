import { AppShell } from '@/components/AppShell';
import { requireSession } from '@/lib/session';

/*
 * The shell around every workspace page renders per-session data: the person's
 * name, their role, and how many notifications they have not read. None of that
 * may be cached across requests, and caching it is what made "mark all as read"
 * appear to do nothing — the count was written, and the layout that displays it
 * was served from before the write.
 */
export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {children}
    </AppShell>
  );
}

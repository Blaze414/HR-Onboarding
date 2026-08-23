import { AppShell } from '@/components/AppShell';
import { requireSession } from '@/lib/session';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {children}
    </AppShell>
  );
}

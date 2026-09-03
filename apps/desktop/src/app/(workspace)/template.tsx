import { PageTransition } from '@/components/PageTransition';

/**
 * `template.tsx` remounts on every navigation within this route group,
 * unlike `layout.tsx` which persists — that's what makes each page landing
 * read as an arrival. The sidebar, topbar and session data in layout.tsx
 * stay put; only the page content underneath animates in.
 */
export default function WorkspaceTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}

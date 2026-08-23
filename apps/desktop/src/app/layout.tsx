import type { Metadata } from 'next';
import { ToastProvider } from '@/components/Toast';
import { themeScript } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Snoopy Workplace — People, Learning & Work Hub',
  description: 'Manage people, learning and work in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}

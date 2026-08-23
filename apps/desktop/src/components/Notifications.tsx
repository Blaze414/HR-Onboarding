'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { timeAgo, type AppNotification } from '@snoopy/shared';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/actions';
import { Icon } from './Icon';

/**
 * The bell reads as quiet until something is actually waiting: no count, no
 * accent, no motion. An unread item is the only thing that earns the dot, and
 * the dot is what the eye returns to — so nothing else in the header competes
 * with it.
 */
export function Notifications({ initial, unread }: { initial: AppNotification[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setItems(initial); }, [initial]);

  // Close on outside click and on Escape — a panel that traps you is worse than
  // no panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unreadNow = items.filter((n) => !n.read_at).length || unread;

  function markRead(id: string) {
    // Optimistic: the row settles immediately, the server catches up.
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    startTransition(() => { void markNotificationReadAction(id).then(() => router.refresh()); });
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    startTransition(() => { void markAllNotificationsReadAction().then(() => router.refresh()); });
  }

  return (
    <div className="notif" ref={panel}>
      <button
        className="notif-bell"
        aria-label={unreadNow ? `Notifications, ${unreadNow} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={17} />
        {unreadNow > 0 ? <span className="notif-dot" aria-hidden>{unreadNow > 9 ? '9+' : unreadNow}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unreadNow > 0 ? (
              <button className="btn btn-sm btn-ghost" onClick={markAll}>Mark all read</button>
            ) : null}
          </div>

          <div className="notif-list">
            {items.length === 0 ? (
              <p className="notif-empty">You are up to date. Anything needing your attention will appear here.</p>
            ) : items.map((n) => {
              const body = (
                <>
                  <span className="notif-title">{n.title}</span>
                  {n.body ? <span className="notif-body">{n.body}</span> : null}
                  <span className="notif-when">{timeAgo(n.created_at)}</span>
                </>
              );
              const className = `notif-item${n.read_at ? '' : ' is-unread'}`;
              return n.href ? (
                <Link
                  key={n.id} href={n.href} className={className}
                  onClick={() => { markRead(n.id); setOpen(false); }}
                >
                  {body}
                </Link>
              ) : (
                <button key={n.id} className={className} onClick={() => markRead(n.id)}>{body}</button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { Icon } from './Icon';

export type ToastTone = 'ok' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Set while the toast plays its exit, so the DOM node outlives its removal. */
  leaving?: boolean;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

/** Long enough to read a sentence, short enough not to linger over the work. */
const LIFETIME = 4200;
/**
 * A toast held open by the pointer must still go away eventually. Pausing
 * depends on a leave event arriving to match the enter, and a pointer that
 * leaves the window, a dragged file, or a disabled element can swallow it — at
 * which point a confirmation sits over the work forever. This ceiling makes
 * that impossible regardless.
 */
const MAX_LIFETIME = 15000;
/** Must match the exit animation, or the node is removed mid-flight. */
const EXIT = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const ceilings = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    // Mark it leaving first so the exit can play, then drop it once the
    // animation has finished. Removing immediately is what makes a toast
    // disappear with a snap.
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const ceiling = ceilings.current.get(id);
    if (ceiling) { clearTimeout(ceiling); ceilings.current.delete(id); }

    const timer = setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, EXIT);
    timers.current.set(id, timer);
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = nextId.current++;
    setToasts((list) => {
      // Three at once is already a wall of text over the work; the oldest goes.
      const trimmed = list.length >= 3 ? list.slice(1) : list;
      return [...trimmed, { id, tone, message }];
    });
    timers.current.set(id, setTimeout(() => remove(id), LIFETIME));
    ceilings.current.set(id, setTimeout(() => remove(id), MAX_LIFETIME));
  }, [remove]);

  useEffect(() => {
    const running = timers.current;
    const capped = ceilings.current;
    return () => {
      running.forEach((timer) => clearTimeout(timer));
      capped.forEach((timer) => clearTimeout(timer));
      running.clear();
      capped.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={remove} onPause={(id) => {
        const timer = timers.current.get(id);
        if (timer) { clearTimeout(timer); timers.current.delete(id); }
      }} onResume={(id) => {
        if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => remove(id), LIFETIME));
      }} />
    </ToastContext.Provider>
  );
}

function Toaster({
  toasts, onDismiss, onPause, onResume,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}) {
  // Dismiss the newest with Escape: the keyboard path to getting the
  // confirmation out of the way, without hunting for a small button.
  useEffect(() => {
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const last = toasts[toasts.length - 1];
      if (last && !last.leaving) onDismiss(last.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toasts, onDismiss]);

  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        // The slot collapses the stack; the toast itself only moves and fades,
        // so nothing animates a layout property.
        <div key={toast.id} className={`toast-slot${toast.leaving ? ' is-leaving' : ''}`}>
        <div
          className={`toast toast-${toast.tone}${toast.leaving ? ' is-leaving' : ''}`}
          // Polite for confirmations, assertive when something failed: an error
          // that waits its turn is read after the person has moved on.
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          onPointerEnter={() => onPause(toast.id)}
          onPointerLeave={() => onResume(toast.id)}
          onFocus={() => onPause(toast.id)}
          onBlur={() => onResume(toast.id)}
        >
          <span className="toast-mark" aria-hidden>
            <Icon name={toast.tone === 'error' ? 'close' : 'check'} size={13} />
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            aria-label={`Dismiss: ${toast.message}`}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        </div>
      ))}
    </div>
  );
}

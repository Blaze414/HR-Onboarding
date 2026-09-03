'use client';

import { useRouter } from 'next/navigation';
import { useToast } from './Toast';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/actions';
import { Icon, type IconName } from './Icon';

/** Runs a server action, shows its error inline, refreshes on success. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Runs a server action and says what happened.
   *
   * Success used to be silent: the dialog closed, the page refreshed, and the
   * person was left inferring from the table whether anything had been saved.
   * A short confirmation is the difference between a tool that answers and one
   * that appears to swallow the click.
   *
   * `confirmation: false` opts out for the rare action whose result is already
   * unmistakable on screen.
   */
  async function call(
    fn: () => Promise<ActionResult>,
    onDone?: (r: ActionResult) => void,
    options: { confirmation?: string | false } = {},
  ) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      const message = result.error ?? 'Something went wrong. Please try again.';
      setError(message);
      // Errors already appear beside the control that failed; the toast is for
      // the case where that control has since been dismissed.
      return result;
    }
    router.refresh();
    if (result.warning) {
      // Partial success is its own outcome: confirming "Saved." would hide the
      // half that did not run.
      toast.show(result.warning, 'info');
    } else if (options.confirmation !== false) {
      toast.show(options.confirmation ?? 'Saved.');
    }
    onDone?.(result);
    return result;
  }

  return { busy, error, setError, call };
}

export function ActionButton({
  label, busyLabel, action, icon, variant = '', confirm, small = true,
}: {
  label: string;
  busyLabel?: string;
  action: () => Promise<ActionResult>;
  icon?: IconName;
  variant?: '' | 'primary' | 'danger';
  confirm?: string;
  small?: boolean;
}) {
  const { busy, error, call } = useAction();
  return (
    <>
      <button
        className={`btn${small ? ' btn-sm' : ''}${variant ? ` btn-${variant}` : ''}`}
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          call(action);
        }}
      >
        {icon ? <Icon name={icon} size={15} /> : null}
        {busy ? (busyLabel ?? 'Working…') : label}
      </button>
      {error ? <span className="error" role="alert" style={{ marginLeft: 8 }}>{error}</span> : null}
    </>
  );
}

export function Overlay({
  title, onClose, children, footer, wide = false,
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  /*
   * A panel that animates open and then vanishes on close reads as a glitch —
   * the eye follows it in and then loses it. Closing is deferred by the length
   * of the exit so the same movement plays in reverse, faster.
   */
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    // Matches the exit duration in the stylesheet. Reduced motion shortens the
    // animation, not this timer, so the panel still leaves promptly.
    window.setTimeout(onClose, 180);
  }, [leaving, onClose]);

  // Escape closes from anywhere in the panel, including the body, rather than
  // only when the wrapper happens to hold focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // The page behind must not scroll while a panel is over it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div
      className={`overlay${leaving ? ' is-leaving' : ''}`}
      role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className={wide ? 'drawer' : 'modal'}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="btn btn-sm btn-ghost" onClick={close} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer ? <div className="panel-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

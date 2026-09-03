'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { fieldErrors, initials, loginSchema } from '@snoopy/shared';

const DEMO_ACCOUNTS = [
  { email: 'lucy@peanutsstudio.test', who: 'Lucy van Pelt', where: 'Admin · Peanuts Creative Studio' },
  { email: 'charlie@peanutsstudio.test', who: 'Charlie Brown', where: 'Employee · Peanuts Creative Studio' },
  { email: 'sally@woodstockdigital.test', who: 'Sally Brown', where: 'Admin · Woodstock Digital' },
  { email: 'linus@woodstockdigital.test', who: 'Linus van Pelt', where: 'Employee · Woodstock Digital' },
];

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);

    /*
     * Sign in goes through this app's own route rather than straight to the
     * auth service, so that failed attempts are counted somewhere the browser
     * cannot edit and repeated guessing can be slowed down. The session it
     * hands back is the same one; only the door changed.
     */
    const response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /*
       * The browser's own time zone, sent with the attempt. It is not looked
       * up from the address: resolving an IP to a place means handing somebody
       * else your staff's addresses, and the clock the device is actually set
       * to is better evidence anyway. Shown back only to the account holder,
       * and to a Super Administrator investigating a breach.
       */
      body: JSON.stringify({
        ...parsed.data,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setFormError(body?.error ?? 'Could not reach the server. Check your connection and try again.');
      setBusy(false);
      return;
    }
    router.replace(params.get('next') ?? '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate>
      {formError ? <div className="alert" role="alert">{formError}</div> : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email" className="input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email ? <span className="error" id="email-error">{errors.email}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password" className="input" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password ? <span className="error" id="password-error">{errors.password}</span> : null}
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} aria-busy={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="demo-accounts">
        <p className="subtle" style={{ marginBottom: 10 }}>Demo accounts — password <code>snoopy123</code></p>
        {DEMO_ACCOUNTS.map((a) => (
          <button
            key={a.email} type="button"
            onClick={() => { setEmail(a.email); setPassword('snoopy123'); }}
          >
            <span className="avatar" aria-hidden>{initials(a.who)}</span>
            <span>
              <span className="who" style={{ display: 'block' }}>{a.who}</span>
              <span className="where">{a.where}</span>
            </span>
          </button>
        ))}
      </div>
    </form>
  );
}

export function LoginForm() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 200 }} />}><Form /></Suspense>;
}

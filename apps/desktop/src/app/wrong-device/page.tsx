import { headers } from 'next/headers';
import { PRODUCT_NAME } from '@snoopy/shared';
import { SnoopyMark } from '@/components/Snoopy';

export const dynamic = 'force-dynamic';

/**
 * Where the companion app lives, or null when it cannot be worked out.
 *
 * A deployment states the address. The port guess is only valid on a
 * development host, because pointing at :8081 on a real domain would be a dead
 * link — and a button that goes nowhere is worse than no button.
 */
async function companionAppUrl(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_MOBILE_APP_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = (await headers()).get('host') ?? '';
  const hostname = host.split(':')[0];
  const isDevHost = hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (!isDevHost) return null;

  const proto = (await headers()).get('x-forwarded-proto') ?? 'http';
  return `${proto}://${hostname}:8081`;
}

/**
 * Shown when a phone reaches the management workspace and the automatic
 * redirect could not run — the companion app's address is unset, or a redirect
 * already happened and did not settle.
 *
 * Refusing is deliberate: admitting the phone would defeat the rule and
 * redirecting again would loop. But a refusal should still offer the way out
 * when one is known, so this carries a link whenever the address can be found.
 */
export default async function WrongDevicePage() {
  const companion = await companionAppUrl();

  return (
    <main className="wrong-device">
      <SnoopyMark />
      <h1>{PRODUCT_NAME} is not available on this device</h1>
      <p>
        This is the management workspace, built for a computer. On a phone, use the
        Snoopy Workplace companion app instead — it carries your courses, tasks,
        events and onboarding.
      </p>

      {companion ? (
        <a className="btn btn-primary wrong-device-action" href={companion}>
          Open the companion app
        </a>
      ) : (
        <p className="muted">
          Ask your workspace administrator for the companion app address.
        </p>
      )}

      <p className="muted">
        If you reached this page on a computer, the workspace is still here — reload
        to try again.
      </p>
    </main>
  );
}

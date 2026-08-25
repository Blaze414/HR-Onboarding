import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { authService, loginSchema, resolveBackendUrl } from '@snoopy/shared';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * The one door into the workspace.
 *
 * Counting attempts and refusing to keep answering is *not* done here — it is
 * done by a hook inside the auth service, so it covers the phone app and
 * anything else holding the anon key as well. See
 * `20260825000300_sign_in_hook.sql`.
 *
 * What this route adds is the part the hook cannot see: the network. A
 * database function invoked by the auth service has no idea which address or
 * which browser the attempt came from, and those are exactly the two details
 * that let somebody recognise a sign in that was not them. So the hook writes
 * the attempt and this route fills in where it came from.
 *
 * What this route does *not* do is decide anything about access. It proves who
 * somebody is and hands back the same session cookies as before; every
 * question about what they may then read or change is still answered by row
 * level security, per request, against the database.
 */

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * The caller's address, as reported by whatever sits in front of this app.
 *
 * Spoofable, and treated that way: it groups attempts and it tells somebody
 * where their own session came from. It is never an identity and never grants
 * anything.
 */
function callerIp(h: Headers): string | null {
  const forwarded = h.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
}

/**
 * Fill in the address and browser on the attempt the auth hook just recorded.
 *
 * Matched on the newest row for this address that has no origin yet, within a
 * few seconds. Two people signing into the same account at the same instant
 * could in principle swap origins; that is a worse outcome than nothing only
 * if somebody reads it as proof rather than as a hint, which is why the column
 * is documented as a hint. Best effort throughout — a sign in must never fail
 * because the app could not annotate it.
 */
const describeDevice = authService.describeDevice;

async function recordWhereItCameFrom(
  email: string, ip: string | null, userAgent: string | null, timeZone: string | null,
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const service = admin();
    const { data: row } = await service
      .from('sign_in_events')
      .select('id')
      .eq('email', email)
      .is('ip', null)
      .gte('at', new Date(Date.now() - 30_000).toISOString())
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row?.id) {
      await service.from('sign_in_events')
        .update({
          ip,
          user_agent: userAgent,
          // Named so the phone's own history can tell the two apart. The phone
          // stamps its rows itself, through `describe_my_sign_in`.
          client: 'Web workspace',
          device: describeDevice(userAgent),
          time_zone: timeZone?.slice(0, 60) ?? null,
        })
        .eq('id', row.id);
    }
  } catch {
    // An unannotated sign in is still a recorded sign in.
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter an email address and a password.' }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const h = await headers();
  const ip = callerIp(h);
  const userAgent = h.get('user-agent');

  // Cookies are written through the same @supabase/ssr client the rest of the
  // app reads, so the session this route creates is the session every later
  // request verifies.
  const cookieStore = await cookies();
  const supabase = createServerClient(
    resolveBackendUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, h.get('host')),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, {
            ...options,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          }));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email, password: parsed.data.password,
  });

  // Read off the raw body rather than the parsed credentials: it is a
  // decoration on the record, not part of proving who anybody is, and it must
  // not be able to make a sign in fail.
  const timeZone = typeof body?.timeZone === 'string' ? body.timeZone : null;
  await recordWhereItCameFrom(email, ip, userAgent, timeZone);

  if (error) {
    /*
     * The hook refuses with 429 once somebody has guessed too often, and that
     * message is worth passing through — it tells a person locked out of their
     * own account what to do. Everything else becomes one sentence: saying
     * whether the address exists is a way of enumerating who works here.
     */
    const tooMany = (error as { status?: number }).status === 429;
    return NextResponse.json(
      { error: tooMany ? error.message : 'Email or password is incorrect.' },
      { status: tooMany ? 429 : 401 },
    );
  }
  return NextResponse.json({ ok: true });
}

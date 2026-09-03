import { redirect } from 'next/navigation';
import { cache } from 'react';
import { can, type Capability, authService, type Platform, type Profile } from '@snoopy/shared';
import { getServerSupabase } from './supabase-server';

export interface Session {
  userId: string;
  profile: Profile;
  organisationId: string;
  platform: Platform;
  /**
   * Capability keys granted by the user's assigned role, or null when they are
   * on no custom role and the tier defaults apply.
   */
  permissions: string[] | null;
  /**
   * Whether anybody reports to this person. Decides the team navigation, which
   * would otherwise offer an empty page to most of the workspace.
   */
  hasReports: boolean;
}

/** The desktop client is always the "desktop" platform for capability checks. */
export const PLATFORM: Platform = 'desktop';

/**
 * Memoised for the lifetime of one request. A page can call this from the
 * layout, the route guard and half a dozen nested sections without turning
 * into a dozen round trips to the auth service.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const db = await getServerSupabase();

  // Identity comes from the cookie, but nothing is trusted on that basis alone:
  // the very next call loads the profile with this token, and PostgREST verifies
  // the signature and applies RLS before returning a row. A forged or expired
  // token therefore yields no profile, and this function returns null — the same
  // outcome as an auth-service round trip, without paying for one on every page.
  /*
   * Also the place a dead refresh token surfaces — a cookie whose session no
   * longer exists, most easily produced by resetting the database under a
   * signed-in browser. It is not an error worth raising at somebody: it means
   * signed out, and the middleware clears the cookie on the way past.
   */
  let user;
  try {
    const { data, error } = await db.auth.getSession();
    if (error) return null;
    user = data.session?.user;
  } catch {
    return null;
  }
  if (!user) return null;

  // A rejected token surfaces here as a failed profile load. Treat it as signed
  // out and let the caller redirect, rather than throwing a database error at
  // someone whose session simply expired.
  let profile;
  try {
    profile = await authService.loadProfile(db, user.id);
  } catch {
    return null;
  }
  if (!profile) return null;

  // Counted rather than fetched: the navigation needs to know whether the list
  // is empty, not what is in it.
  const { count } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', user.id)
    .eq('is_active', true);

  return {
    userId: user.id,
    profile,
    organisationId: profile.organisation_id,
    platform: PLATFORM,
    permissions: profile.role_profile?.permissions ?? null,
    hasReports: (count ?? 0) > 0,
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * Capability check for a loaded session. Prefer this over calling `can()`
 * directly: it carries the session's granted permissions, which is the whole
 * difference between an Administrator and a narrower admin-tier role.
 */
export function sessionCan(session: Session, capability: Capability): boolean {
  return can(capability, session.profile.role, session.platform, session.permissions);
}

/**
 * Route and action guard. Navigation hides what a role cannot reach, but the
 * routes and server actions reject it too — hiding a link is not access control.
 *
 * This guards the boundary *within* a tier, which RLS cannot express: the
 * database sees "admin" for both an Administrator and a Learning Coordinator,
 * so only the granted permission list separates them. The tier boundary itself
 * is still enforced below, by RLS, whatever this function decides.
 */
export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!sessionCan(session, capability)) redirect('/dashboard?denied=1');
  return session;
}

/** Tier-only guard, for routes that any admin-tier role may reach. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== 'admin') redirect('/dashboard?denied=1');
  return session;
}

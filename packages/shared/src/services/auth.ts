import type { Db } from '../supabase';
import type { EmergencyContact, Profile } from '../types';

export async function signIn(db: Db, email: string, password: string) {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signOut(db: Db) {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

/**
 * The signed-in user's profile carries the organisation they belong to.
 * Tenancy always comes from here, never from anything the client supplies.
 */
export async function loadProfile(db: Db, userId: string): Promise<Profile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*, department:departments!profiles_department_id_fkey(id,name), manager:profiles!manager_id(id,name), role_profile:roles(id,name,permissions,base_role)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function updateOwnProfile(
  db: Db, userId: string, patch: Partial<Pick<Profile, 'name' | 'phone' | 'job_title' | 'avatar_url'>>,
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles').update(patch).eq('id', userId).select('*').single();
  if (error) throw error;
  return data as Profile;
}


/**
 * The fields a person may change about themselves.
 *
 * Deliberately a short list. Everything else on a profile is an HR fact, and
 * the database restores it if an update touches it — this function exists so
 * the client asks for the right thing rather than relying on that.
 */
export async function updateOwnDetails(db: Db, userId: string, input: {
  phone?: string | null;
}): Promise<void> {
  const { error } = await db
    .from('profiles')
    .update({ phone: input.phone?.trim() || null })
    .eq('id', userId);
  if (error) throw error;
}

export async function loadEmergencyContact(db: Db, userId: string): Promise<EmergencyContact | null> {
  const { data, error } = await db
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as EmergencyContact) ?? null;
}

/**
 * Saves, or clears when the name is emptied.
 *
 * A name with nobody to ring is not a contact, so both fields are required
 * together — enforced here and by `not null` on the table.
 */
export async function saveEmergencyContact(db: Db, input: {
  userId: string; organisationId: string;
  name: string; relationship?: string | null; phone: string;
}): Promise<void> {
  if (!input.name.trim()) {
    const { error } = await db.from('emergency_contacts').delete().eq('user_id', input.userId);
    if (error) throw error;
    return;
  }
  if (!input.phone.trim()) throw new Error('Add a number for your emergency contact.');

  const { error } = await db.from('emergency_contacts').upsert({
    user_id: input.userId,
    organisation_id: input.organisationId,
    name: input.name.trim(),
    relationship: input.relationship?.trim() || null,
    phone: input.phone.trim(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Where this account has been signed into.
 *
 * Shown to the person it belongs to, and to nobody else — the read policy on
 * `sign_in_events` allows only your own rows. Zero trust assumes a session can
 * be stolen; the cheapest control against that is the account holder noticing
 * a sign in they did not make, which requires showing them.
 */
export interface SignInEvent {
  id: string;
  succeeded: boolean;
  ip: string | null;
  user_agent: string | null;
  /** Which app it came through, when the app got a chance to say. */
  client: string | null;
  device: string | null;
  /** The clock the device was set to, as it reported it. Never geolocated. */
  time_zone: string | null;
  at: string;
}

/**
 * One history, read the same way by both apps.
 *
 * There is nothing per-client about this query: the rows belong to the person,
 * not to the app that made them, so a sign in on the phone shows up on the
 * desktop list and a sign in on the desktop shows up on the phone. The read
 * policy allows only your own, so the limit is the same everywhere too.
 */
export async function listSignIns(db: Db, limit = 10): Promise<SignInEvent[]> {
  const { data, error } = await db
    .from('sign_in_events')
    .select('id, succeeded, ip, user_agent, client, device, time_zone, at')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SignInEvent[];
}

/**
 * Say which app this sign in came through.
 *
 * The web app does this from the server, where it also knows the address. The
 * phone has no server and no service key, so it stamps its own row — which the
 * database only allows for the caller's own most recent undescribed attempt,
 * within a minute of it happening.
 *
 * Best effort: a sign in must never fail because the label did not stick.
 */
export async function describeThisSignIn(
  db: Db, client: string, device: string, timeZone?: string,
): Promise<void> {
  await db.rpc('describe_my_sign_in', {
    client_name: client, device_name: device, zone_name: timeZone ?? null,
  }).then(() => undefined, () => undefined);
}

/** What to show for an attempt, whichever app made it. */
export function signInSummary(event: SignInEvent): string {
  if (event.client && event.device) return `${event.client} · ${event.device}`;
  if (event.client) return event.client;
  if (event.user_agent) return describeDevice(event.user_agent);
  // A failed attempt never reaches an app that could describe it: nothing
  // signed in, so nothing had a session to speak with.
  return event.succeeded ? 'An app that did not identify itself' : 'Unknown device';
}

/** "Chrome on macOS" out of a user agent string, or nothing rather than noise. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Browser';
  const platform = /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'an unknown platform';
  return `${browser} on ${platform}`;
}

import { authService, type Platform, type Profile } from '@snoopy/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { forgetThisDevice, registerForPush } from './push';
import { supabase } from './supabase';

/** The phone app is always the "mobile" platform for capability checks. */
export const PLATFORM: Platform = 'mobile';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  loading: true, session: null, profile: null,
  refreshProfile: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  async function loadProfile(userId: string | undefined) {
    if (!userId) { setProfile(null); return; }
    try {
      const loaded = await authService.loadProfile(supabase, userId);
      setProfile(loaded);
      // Fire and forget: a device that cannot register still gets every
      // reminder in the app, so nothing waits on this.
      if (loaded) void registerForPush(loaded);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user.id);
      })
      // Whatever happens, the app must stop showing a loading state — an
      // unreachable backend should land on the sign-in screen, not a spinner.
      .finally(() => { if (active) setLoading(false); });

    /*
     * The callback must not await another Supabase call.
     *
     * supabase-js serialises auth work behind a lock, and this callback runs
     * while that lock is held. Loading the profile issues a request that needs
     * the session, so it waits for the same lock and the two deadlock: sign in
     * succeeds, but nothing after it ever resolves and the button spins forever.
     * Handing the profile load to a later tick releases the lock first.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setTimeout(() => {
        if (!active) return;
        void loadProfile(next?.user.id).finally(() => setLoading(false));
      }, 0);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    loading,
    session,
    profile,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      // Forget the device first: after sign out the delete would be refused by
      // the row policy, and the phone would keep buzzing for somebody who left.
      await forgetThisDevice();
      await supabase.auth.signOut();
    },
  }), [loading, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Convenience for screens that only run once a profile exists. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useProfile used outside an authenticated screen');
  return profile;
}

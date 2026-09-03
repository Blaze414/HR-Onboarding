'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy} aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        await getBrowserSupabase().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

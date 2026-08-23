'use client';

import type { Role } from '@snoopy/shared';
import { assignRoleAction } from '@/lib/actions';
import { useAction } from './Interactive';

/** Inline role change from the users table. */
export function RoleSelect({
  userId, roleId, roles,
}: { userId: string; roleId: string | null; roles: Role[] }) {
  const { busy, error, call } = useAction();
  return (
    <div className="row">
      <select
        className="select" aria-label="Role" value={roleId ?? ''} disabled={busy}
        onChange={(e) => call(() => assignRoleAction(userId, e.target.value))}
      >
        {roleId ? null : <option value="">No role</option>}
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

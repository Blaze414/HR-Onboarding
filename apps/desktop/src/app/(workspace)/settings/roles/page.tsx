import Link from 'next/link';
import { employeeService, roleService } from '@snoopy/shared';
import { RoleEditor } from '@/components/RoleEditor';
import { RoleSelect } from '@/components/RoleSelect';
import { EmptyState, PageHead, Person, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const session = await requireCapability('user.role_management');
  // A Super Administrator is the one role that may edit its own definition.
  const canEditOwnRole = sessionCan(session, 'user.role_management_self');
  const db = await getServerSupabase();
  const [roles, employees] = await Promise.all([
    roleService.listRoles(db),
    employeeService.listEmployees(db),
  ]);

  const holders = new Map<string, number>();
  for (const e of employees) {
    if (e.role_id) holders.set(e.role_id, (holders.get(e.role_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHead
        title="Roles and permissions"
        subtitle="A role sets a security tier and the permissions inside it. The tier is enforced by the database; permissions decide what the role reaches within that tier."
        actions={<RoleEditor />}
      />

      <TableCard title="Roles">
        <table className="table">
          <thead>
            <tr><th>Role</th><th>Tier</th><th className="num">Permissions</th><th className="num">People</th><th /></tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  <span style={{ fontWeight: 560 }}>{r.name}</span>
                  {r.is_system ? <span className="badge" style={{ marginLeft: 8 }}>System</span> : null}
                  {r.description ? <div className="subtle truncate" style={{ maxWidth: 380 }}>{r.description}</div> : null}
                </td>
                <td><StatusBadge status={r.base_role === 'admin' ? 'admin' : 'employee'} /></td>
                <td className="num">{r.permissions.length}</td>
                <td className="num">{holders.get(r.id) ?? 0}</td>
                <td className="actions">
                  <RoleEditor
                    role={r}
                    trigger={r.is_system || (r.id === session.profile.role_id && !canEditOwnRole) ? 'View' : 'Edit'}
                    lockedReason={
                      r.id === session.profile.role_id && !canEditOwnRole
                        ? 'This is the role you hold. Editing it could remove your own access, so only a Super Administrator can change it.'
                        : undefined
                    }
                  />
                </td>
              </tr>
            ))}
            {roles.length === 0 ? (
              <tr><td colSpan={5}><EmptyState message="No roles defined yet." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      <div style={{ height: 18 }} />

      <TableCard
        title="Who holds what"
        action={<Link className="btn btn-sm" href="/settings">Back to settings</Link>}
      >
        <table className="table">
          <thead><tr><th>Person</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td><Person name={e.name} meta={e.email} href={`/employees/${e.id}`} /></td>
                <td>
                  {e.id === session.userId && !canEditOwnRole
                    ? <span className="subtle">{e.role_profile?.name ?? '—'} (your role)</span>
                    : <RoleSelect userId={e.id} roleId={e.role_id} roles={roles} />}
                </td>
                <td className="subtle">{e.department?.name ?? '—'}</td>
                <td>{e.is_active ? <span className="badge badge-ok">Active</span> : <span className="badge">Inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

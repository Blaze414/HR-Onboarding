import Link from 'next/link';
import {
  DOCUMENT_CATEGORIES, employeeService, organisationService, PRODUCT_NAME, roleService,
} from '@snoopy/shared';
import { DepartmentEditor } from '@/components/DepartmentEditor';
import { InviteUser } from '@/components/InviteUser';
import { RoleSelect } from '@/components/RoleSelect';
import { SmallBusinessTest } from '@/components/SmallBusinessTest';
import { Card, EmptyState, PageHead, Person, StatusBadge, TableCard } from '@/components/ui';
import { requireSession, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const db = await getServerSupabase();
  const isAdmin = sessionCan(session, 'organisation.settings');

  if (!isAdmin) {
    return (
      <>
        <PageHead title="Settings" subtitle="Personal preferences for your account." />
        <Card title="Account">
          <dl className="dl">
            <dt>Signed in as</dt><dd>{session.profile.email}</dd>
            <dt>Role</dt><dd><StatusBadge status={session.profile.role} /></dd>
          </dl>
          <p className="muted" style={{ marginTop: 14 }}>
            Organisation settings are managed by your administrator. Update your own details on the{' '}
            <Link className="link" href="/profile">profile page</Link>.
          </p>
        </Card>

        {/*
          * Role management and organisation settings are separate permissions, so
          * a role may hold the first without the second. Settings is the only way
          * into the roles page now, and a permission with no route to reach it is
          * the same as not having it.
          */}
        {sessionCan(session, 'user.role_management') ? (
          <>
                  <Card title="Users and roles">
              <p className="muted" style={{ margin: '0 0 14px' }}>
                You can define what each role reaches inside the workspace.
              </p>
              <Link className="btn btn-sm" href="/settings/roles">Manage roles</Link>
            </Card>
          </>
        ) : null}
      </>
    );
  }

  const [organisation, departments, employees, roles] = await Promise.all([
    db.from('organisations').select('*').eq('id', session.organisationId).maybeSingle(),
    employeeService.listDepartments(db),
    employeeService.listEmployees(db),
    roleService.listRoles(db),
  ]);
  const sizeTest = await organisationService.smallBusinessTest(db);

  return (
    <>
      <PageHead title="Settings" subtitle="Organisation profile, departments, roles and workspace preferences." />

      <div className="grid grid-2">
        <Card title="Organisation profile">
          <dl className="dl">
            <dt>Name</dt><dd>{organisation.data?.name}</dd>
            <dt>Workspace</dt><dd className="subtle">{organisation.data?.slug}</dd>
            <dt>Employees</dt><dd>{employees.length}</dd>
            <dt>Product</dt><dd>{PRODUCT_NAME}</dd>
          </dl>
        </Card>

        <Card title="Document categories">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {DOCUMENT_CATEGORIES.map((c) => <span key={c} className="badge">{c}</span>)}
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>
            Categories are shared across the organisation and applied when a document is uploaded.
          </p>
        </Card>
      </div>

      {/*
        * Not a setting in the ordinary sense — an answer to a legal test that
        * decides what the workspace owes people. It lives here because it is a
        * fact about the organisation, and it is asked rather than guessed
        * because two of the three things the Act counts are invisible from
        * inside this database.
        */}
      {sizeTest ? (
        <Card title="Are we a small business employer?">
          <SmallBusinessTest test={sizeTest} canEdit={isAdmin} />
        </Card>
      ) : null}

      <TableCard
        title="Departments"
        action={<DepartmentEditor managers={employees} />}
      >
        <table className="table">
          <thead><tr><th>Department</th><th>Manager</th><th>Description</th></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td><Link className="link" href={`/departments/${d.id}`}>{d.name}</Link></td>
                <td className="subtle">{employees.find((e) => e.id === d.manager_id)?.name ?? '—'}</td>
                <td className="subtle">{d.description ?? '—'}</td>
              </tr>
            ))}
            {departments.length === 0 ? <tr><td colSpan={3}><EmptyState message="No departments yet." /></td></tr> : null}
          </tbody>
        </table>
      </TableCard>


      <TableCard
        title="Users and roles"
        action={
          <div className="row">
            <Link className="btn btn-sm" href="/settings/roles">Manage roles</Link>
            {/* Guarded by the permission that owns document requests: the page
                behind this link refuses anyone without it. */}
            {sessionCan(session, 'document.request') ? (
              <Link className="btn btn-sm" href="/settings/checklists">Document checklists</Link>
            ) : null}
            <InviteUser roles={roles} departments={departments} managers={employees} />
            <Link className="btn btn-sm btn-primary" href="/employees/new">Add employee</Link>
          </div>
        }
      >
        <table className="table">
          <thead><tr><th>Person</th><th>Role</th><th>Tier</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td><Person name={e.name} meta={e.email} href={`/employees/${e.id}?tab=edit`} /></td>
                <td><RoleSelect userId={e.id} roleId={e.role_id} roles={roles} /></td>
                <td><StatusBadge status={e.role} /></td>
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

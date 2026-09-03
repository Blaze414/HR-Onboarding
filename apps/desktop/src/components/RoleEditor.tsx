'use client';

import { useState } from 'react';
import {
  capabilitiesForTier, capabilityLabel, capabilityMatrix, CRUD_COLUMNS, CRUD_LABELS,
  type Capability, type Role, type UserRole,
} from '@snoopy/shared';
import { deleteRoleAction, saveRoleAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

export function RoleEditor({ role, trigger, lockedReason }: {
  role?: Role;
  trigger?: string;
  /** Set when this role is read-only for reasons other than being a system role. */
  lockedReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [baseRole, setBaseRole] = useState<UserRole>(role?.base_role ?? 'employee');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const { busy, error, setError, call } = useAction();

  const ceiling = capabilitiesForTier(baseRole);
  const matrix = capabilityMatrix(baseRole);

  const toggle = (capability: Capability, on: boolean) =>
    setPermissions((p) => (on ? [...new Set([...p, capability])] : p.filter((x) => x !== capability)));

  const locked = (role?.is_system ?? false) || Boolean(lockedReason);

  return (
    <>
      <button className={`btn btn-sm${trigger ? '' : ' btn-primary'}`} onClick={() => setOpen(true)}>
        {trigger ? trigger : <><Icon name="plus" size={15} /> New role</>}
      </button>

      {open ? (
        <Overlay
          title={role ? (locked ? `${role.name} (read only)` : `Edit ${role.name}`) : 'New role'}
          onClose={() => setOpen(false)}
          wide
          footer={
            <>
              {role && !locked ? (
                <button
                  className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} aria-busy={busy}
                  onClick={() => {
                    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
                    call(() => deleteRoleAction(role.id), () => setOpen(false));
                  }}
                >
                  Delete role
                </button>
              ) : null}
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || locked} aria-busy={busy}
                onClick={() => {
                  if (name.trim().length < 2) { setError('Give the role a name.'); return; }
                  call(
                    () => saveRoleAction({
                      id: role?.id, name, description: description || undefined,
                      base_role: baseRole, permissions,
                    }),
                    () => setOpen(false),
                  );
                }}
              >
                {busy ? 'Saving…' : 'Save role'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          {lockedReason ? (
            <div className="alert alert-info">{lockedReason}</div>
          ) : locked ? (
            <div className="alert alert-info">
              System roles ship with the workspace and stay as they are. Duplicate the permissions
              into a new role to make a variant.
            </div>
          ) : null}

          <Field label="Role name">
            <input className="input" value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Description" hint="What is this role for?">
            <textarea className="input" value={description ?? ''} disabled={locked}
              onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Field
            label="Security tier"
            hint="The tier is what the database enforces. Permissions below refine what the role reaches inside it — they can never exceed it."
          >
            <select
              className="select" value={baseRole} disabled={locked}
              onChange={(e) => {
                const next = e.target.value as UserRole;
                setBaseRole(next);
                const allowed = capabilitiesForTier(next) as string[];
                setPermissions((p) => p.filter((x) => allowed.includes(x)));
              }}
            >
              <option value="employee">Employee — own work only</option>
              <option value="admin">Admin — can manage the organisation</option>
            </select>
          </Field>

          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>Permissions</h3>
            <span className="subtle">{permissions.length} of {ceiling.length} selected</span>
          </div>

          {/*
            * A grid rather than a list: create, edit and delete are the
            * distinctions that matter when granting a role, and reading down a
            * column answers "who can delete anything?" in one pass. Operations a
            * resource does not have are shown as gaps, so the shape of each
            * resource stays visible.
            */}
          <table className="crud">
            <thead>
              <tr>
                <th />
                {CRUD_COLUMNS.map((column) => <th key={column}>{CRUD_LABELS[column]}</th>)}
                <th className="crud-extras-head">Also</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.group}>
                  <th scope="row">{row.group}</th>
                  {CRUD_COLUMNS.map((column) => {
                    const capability = row.cells[column];
                    return (
                      <td key={column} data-label={CRUD_LABELS[column]}>
                        {capability ? (
                          <label className="crud-cell">
                            <input
                              type="checkbox" className="checkbox" disabled={locked}
                              checked={permissions.includes(capability)}
                              onChange={(e) => toggle(capability, e.target.checked)}
                              aria-label={`${CRUD_LABELS[column]} ${row.group.toLowerCase()}`}
                            />
                          </label>
                        ) : (
                          <span className="crud-none" aria-label="Not applicable">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="crud-extras">
                    {row.extras.map((capability) => (
                      <label key={capability} className="crud-chip">
                        <input
                          type="checkbox" className="checkbox" disabled={locked}
                          checked={permissions.includes(capability)}
                          onChange={(e) => toggle(capability, e.target.checked)}
                          // Named explicitly: the visible text sits in a sibling
                          // span, and screen readers were announcing these as an
                          // unlabelled "on".
                          aria-label={`${capabilityLabel(capability)} — ${row.group.toLowerCase()}`}
                        />
                        <span>{capabilityLabel(capability)}</span>
                      </label>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </Overlay>
      ) : null}
    </>
  );
}

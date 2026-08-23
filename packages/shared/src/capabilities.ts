import type { Platform, UserRole } from './types';

/**
 * Central capability definitions.
 *
 * These drive navigation and UI affordances only. The real security boundary
 * is Row Level Security in PostgreSQL — a capability that says "allowed" still
 * fails at the database if the policies disagree, and that is intentional.
 */
export type Capability =
  | 'course.view' | 'course.update_progress' | 'course.create' | 'course.edit' | 'course.delete'
  | 'course.assign' | 'course.bulk_assign' | 'course.verify'
  | 'task.view' | 'task.complete' | 'task.create' | 'task.edit' | 'task.delete'
  | 'task.assign' | 'task.bulk_assign'
  | 'event.view' | 'event.rsvp' | 'event.create' | 'event.edit' | 'event.delete'
  | 'event.manage_participants'
  | 'document.view' | 'document.upload_personal' | 'document.manage_shared'
  | 'document.delete' | 'document.acknowledge' | 'document.require_acknowledgement'
  | 'document.request' | 'document.submit'
  | 'onboarding.view' | 'onboarding.complete' | 'onboarding.create' | 'onboarding.delete'
  | 'onboarding.template.manage' | 'onboarding.template.delete'
  | 'employee.view_self' | 'employee.view_all' | 'employee.view_team' | 'employee.create'
  | 'employee.edit' | 'employee.deactivate' | 'employee.offboard'
  | 'department.view' | 'department.manage' | 'department.delete'
  | 'credential.submit' | 'credential.verify' | 'credential.verify_team'
  | 'credential.manage' | 'credential.view_coverage'
  | 'document.review_team'
  | 'analytics.view_summary' | 'analytics.view_full'
  | 'report.view_summary' | 'report.view_full'
  | 'organisation.settings' | 'user.role_management' | 'user.role_management_self';

export type CapabilityState = 'allowed' | 'restricted' | 'desktop_only' | 'admin_only';

interface Rule {
  roles: UserRole[];
  platforms: Platform[];
}

const BOTH: Platform[] = ['mobile', 'desktop'];
const DESKTOP: Platform[] = ['desktop'];
const EVERYONE: UserRole[] = ['employee', 'admin'];
const ADMIN: UserRole[] = ['admin'];

const RULES: Record<Capability, Rule> = {
  'course.view':             { roles: EVERYONE, platforms: BOTH },
  'course.update_progress':  { roles: EVERYONE, platforms: BOTH },
  'course.create':           { roles: ADMIN,    platforms: DESKTOP },
  'course.edit':             { roles: ADMIN,    platforms: DESKTOP },
  // Archiving is how a course is removed — the history stays, so this is the
  // delete of this resource rather than a variant of edit.
  'course.delete':           { roles: ADMIN,    platforms: DESKTOP },
  'course.assign':           { roles: ADMIN,    platforms: DESKTOP },
  'course.bulk_assign':      { roles: ADMIN,    platforms: DESKTOP },
  // Confirming that training was actually done, as distinct from the learner
  // saying so. The evidence is only worth what this grant is worth.
  'course.verify':           { roles: ADMIN,    platforms: DESKTOP },

  'task.view':               { roles: EVERYONE, platforms: BOTH },
  'task.complete':           { roles: EVERYONE, platforms: BOTH },
  'task.create':             { roles: ADMIN,    platforms: DESKTOP },
  'task.edit':               { roles: ADMIN,    platforms: DESKTOP },
  'task.delete':             { roles: ADMIN,    platforms: DESKTOP },
  'task.assign':             { roles: ADMIN,    platforms: DESKTOP },
  'task.bulk_assign':        { roles: ADMIN,    platforms: DESKTOP },

  'event.view':              { roles: EVERYONE, platforms: BOTH },
  'event.rsvp':              { roles: EVERYONE, platforms: BOTH },
  'event.create':            { roles: ADMIN,    platforms: DESKTOP },
  'event.edit':              { roles: ADMIN,    platforms: DESKTOP },
  'event.delete':            { roles: ADMIN,    platforms: DESKTOP },
  'event.manage_participants':{ roles: ADMIN,   platforms: DESKTOP },

  'document.view':           { roles: EVERYONE, platforms: BOTH },
  'document.upload_personal':{ roles: EVERYONE, platforms: BOTH },
  'document.manage_shared':  { roles: ADMIN,    platforms: DESKTOP },
  'document.delete':         { roles: ADMIN,    platforms: DESKTOP },
  // Recording that you have read something is everyone's to do, on either
  // client — an acknowledgement you can only give at a desk is a worse record.
  'document.acknowledge':    { roles: EVERYONE, platforms: BOTH },
  'document.require_acknowledgement': { roles: ADMIN, platforms: DESKTOP },
  // Asking somebody for a document, and keeping checklists of what to ask for.
  'document.request':        { roles: ADMIN,    platforms: DESKTOP },
  // Accepting or returning what a direct report sent back.
  'document.review_team':    { roles: EVERYONE, platforms: DESKTOP },
  // Returning one. Everyone, on either client — a contract signed on a phone is
  // still a signed contract, and refusing that just delays the paperwork.
  'document.submit':         { roles: EVERYONE, platforms: BOTH },

  'onboarding.view':         { roles: EVERYONE, platforms: BOTH },
  'onboarding.complete':     { roles: EVERYONE, platforms: BOTH },
  'onboarding.create':       { roles: ADMIN,    platforms: DESKTOP },
  'onboarding.delete':       { roles: ADMIN,    platforms: DESKTOP },
  'onboarding.template.manage': { roles: ADMIN, platforms: DESKTOP },
  'onboarding.template.delete': { roles: ADMIN, platforms: DESKTOP },

  'employee.view_self':      { roles: EVERYONE, platforms: BOTH },
  'employee.view_all':       { roles: ADMIN,    platforms: BOTH },
  // A reporting line, not a tier: an ordinary employee who manages someone can
  // see that person's work. The database enforces the same boundary.
  'employee.view_team':      { roles: EVERYONE, platforms: BOTH },
  'employee.create':         { roles: ADMIN,    platforms: DESKTOP },
  'employee.edit':           { roles: ADMIN,    platforms: DESKTOP },
  'employee.deactivate':     { roles: ADMIN,    platforms: DESKTOP },
  'employee.offboard':       { roles: ADMIN,    platforms: DESKTOP },

  'department.view':         { roles: ADMIN,    platforms: DESKTOP },
  'department.manage':       { roles: ADMIN,    platforms: DESKTOP },
  'department.delete':       { roles: ADMIN,    platforms: DESKTOP },

  // Offering a qualification nobody asked for. Everyone, on either client — a
  // certificate photographed on a phone is the normal case.
  'credential.submit':       { roles: EVERYONE, platforms: BOTH },
  // Checking one. A self-declared certificate is a claim until somebody looks.
  'credential.verify':       { roles: ADMIN,    platforms: DESKTOP },
  /*
   * A manager checking their own team's certificates. A reporting line, not a
   * tier: the person who sights the original is usually the one standing next
   * to them. Sensitive kinds stay with whoever holds `credential.verify` — a
   * manager has no business reading a colleague's identity documents.
   */
  'credential.verify_team':  { roles: EVERYONE, platforms: DESKTOP },
  // Defining which kinds exist and what each one qualifies somebody for.
  'credential.manage':       { roles: ADMIN,    platforms: DESKTOP },
  // Reading the coverage this produces: who could be rostered where.
  'credential.view_coverage': { roles: ADMIN,   platforms: DESKTOP },
  'analytics.view_summary':  { roles: ADMIN,    platforms: BOTH },
  'analytics.view_full':     { roles: ADMIN,    platforms: DESKTOP },
  'report.view_summary':     { roles: EVERYONE, platforms: BOTH },
  'report.view_full':        { roles: ADMIN,    platforms: DESKTOP },

  'organisation.settings':   { roles: ADMIN,    platforms: DESKTOP },
  'user.role_management':    { roles: ADMIN,    platforms: DESKTOP },
  // Editing the role you hold yourself. Held only by a Super Administrator —
  // see the guard triggers in the super-admin migration, which are the real
  // boundary; this key only decides whether the UI offers the control.
  'user.role_management_self': { roles: ADMIN, platforms: DESKTOP },
};

/**
 * A custom role's permission list narrows what its holders can reach inside
 * their tier. It can never widen past the tier, because the tier is what RLS
 * enforces — a role granting `course.create` to an employee-tier user would
 * still be refused by the database, so the capability system refuses it here
 * too rather than showing a button that cannot work.
 */
export function capabilityState(
  capability: Capability,
  role: UserRole,
  platform: Platform,
  grantedPermissions?: string[] | null,
): CapabilityState {
  const rule = RULES[capability];
  if (!rule.roles.includes(role)) return 'admin_only';
  if (!rule.platforms.includes(platform)) return 'desktop_only';
  if (grantedPermissions && !grantedPermissions.includes(capability)) return 'restricted';
  return 'allowed';
}

export function can(
  capability: Capability,
  role: UserRole,
  platform: Platform,
  grantedPermissions?: string[] | null,
): boolean {
  return capabilityState(capability, role, platform, grantedPermissions) === 'allowed';
}

/** Every capability this build knows about, for building a role editor. */
export const ALL_CAPABILITIES = Object.keys(RULES) as Capability[];

/** Grouped for display: "Courses", "Tasks", … */
export function capabilityGroups(): { group: string; capabilities: Capability[] }[] {
  const groups = new Map<string, Capability[]>();
  for (const capability of ALL_CAPABILITIES) {
    const key = capability.split('.')[0];
    const list = groups.get(key);
    if (list) list.push(capability);
    else groups.set(key, [capability]);
  }
  const LABELS: Record<string, string> = {
    course: 'Courses', task: 'Tasks', event: 'Events', document: 'Documents',
    onboarding: 'Onboarding', employee: 'Employees', department: 'Departments',
    analytics: 'Analytics', report: 'Reports', organisation: 'Organisation', user: 'Users',
  };
  return [...groups.entries()].map(([key, capabilities]) => ({
    group: LABELS[key] ?? key, capabilities,
  }));
}

/** Human label for one capability key, e.g. "course.bulk_assign" → "Bulk assign". */
export function capabilityLabel(capability: Capability): string {
  const action = capability.split('.').slice(1).join(' ');
  return action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Capabilities a tier can ever hold — the ceiling for a custom role. */
export function capabilitiesForTier(base: UserRole): Capability[] {
  return ALL_CAPABILITIES.filter((c) => RULES[c].roles.includes(base));
}

export const DESKTOP_ONLY_MESSAGE =
  'This workspace is optimised for desktop. Open Snoopy Workplace on a larger screen to manage this feature.';

export const ADMIN_ONLY_MESSAGE =
  'You do not have permission to manage this. Contact your workspace administrator.';

export function restrictionMessage(state: CapabilityState): string | null {
  if (state === 'desktop_only') return DESKTOP_ONLY_MESSAGE;
  if (state === 'admin_only' || state === 'restricted') return ADMIN_ONLY_MESSAGE;
  return null;
}

/**
 * The CRUD column a capability belongs to, or null when it is a domain action
 * that CRUD does not describe — assigning, completing, replying to an invite.
 * Forcing those into a CRUD grid would misname them, so they are listed
 * separately rather than bent to fit.
 */
export type CrudColumn = 'read' | 'create' | 'update' | 'delete';

export const CRUD_COLUMNS: CrudColumn[] = ['read', 'create', 'update', 'delete'];

export const CRUD_LABELS: Record<CrudColumn, string> = {
  read: 'View', create: 'Create', update: 'Edit', delete: 'Delete',
};

export function crudColumn(capability: Capability): CrudColumn | null {
  const action = capability.split('.').slice(1).join('.');
  if (/^(view|view_all|view_self|view_summary|view_full)$/.test(action)) return 'read';
  if (action === 'create') return 'create';
  if (action === 'edit' || action === 'manage' || action === 'template.manage') return 'update';
  if (action === 'delete' || action === 'deactivate' || action === 'template.delete') return 'delete';
  return null;
}

/**
 * Capabilities arranged as a resource × CRUD grid, with anything CRUD cannot
 * describe kept beside it. `null` in a cell means the resource has no such
 * operation — a course cannot be "completed", a task has no bulk delete.
 */
export function capabilityMatrix(base: UserRole): {
  group: string;
  cells: Record<CrudColumn, Capability | null>;
  extras: Capability[];
}[] {
  const allowed = new Set(capabilitiesForTier(base));
  return capabilityGroups()
    .map(({ group, capabilities }) => {
      const usable = capabilities.filter((c) => allowed.has(c));
      const cells = { read: null, create: null, update: null, delete: null } as
        Record<CrudColumn, Capability | null>;
      const extras: Capability[] = [];
      for (const capability of usable) {
        const column = crudColumn(capability);
        // First match wins: a resource with several read-ish keys shows the
        // broadest in the grid and the rest alongside, rather than silently
        // dropping one.
        if (column && !cells[column]) cells[column] = capability;
        else extras.push(capability);
      }
      return { group, cells, extras };
    })
    .filter((row) => Object.values(row.cells).some(Boolean) || row.extras.length > 0);
}

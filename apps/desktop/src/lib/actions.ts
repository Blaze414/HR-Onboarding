'use server';

import { revalidatePath } from 'next/cache';
import {
  acknowledgementService,
  checklistService,
  credentialService,
  documentRequestService,
  notificationService,
  capabilitiesForTier, courseService, documentService, employeeService, eventService,
  friendlyError, onboardingService, roleService, saveView, deleteSavedView, taskService,
  type StepType,
} from '@snoopy/shared';
import { getSession, requireCapability, requireSession, sessionCan } from './session';
import { getServerSupabase } from './supabase-server';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  /**
   * The work succeeded, but something optional alongside it did not.
   *
   * An employee whose account was created and whose onboarding plan failed is
   * not a failure — reporting it as one invites somebody to add them twice.
   */
  warning?: string;
}

/**
 * Every action re-checks the session server-side. Even if a client bypassed the
 * UI, RLS would still reject the write — this is the layer that turns that
 * rejection into a message a person can read.
 */
async function run(fn: () => Promise<string | void>, paths: string[]): Promise<ActionResult> {
  try {
    const id = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, id: typeof id === 'string' ? id : undefined };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

// ---------------------------------------------------------------- courses
export async function createCourseAction(input: {
  title: string; description?: string; status: any; start_date?: string | null; end_date?: string | null;
}): Promise<ActionResult> {
  const session = await requireCapability('course.create');
  const db = await getServerSupabase();
  return run(async () => {
    const course = await courseService.createCourse(db, session.organisationId, session.userId, {
      title: input.title,
      description: input.description || null,
      status: input.status,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
    });
    return course.id;
  }, ['/courses', '/dashboard']);
}

export async function updateCourseAction(id: string, patch: any): Promise<ActionResult> {
  await requireCapability('course.edit');
  const db = await getServerSupabase();
  return run(() => courseService.updateCourse(db, id, patch).then(() => undefined), ['/courses', `/courses/${id}`]);
}

export async function archiveCourseAction(id: string, archived: boolean): Promise<ActionResult> {
  await requireCapability('course.delete');
  const db = await getServerSupabase();
  return run(
    () => (archived ? courseService.archiveCourse(db, id) : courseService.restoreCourse(db, id)).then(() => undefined),
    ['/courses', `/courses/${id}`],
  );
}

export async function assignCourseAction(
  courseId: string,
  userIds: string[],
  options: { required?: boolean; dueDate?: string | null } = {},
): Promise<ActionResult> {
  const session = await requireCapability('course.assign');
  // Assigning a whole group is its own permission: one mistaken click reaches
  // everybody, so a role can be trusted with single assignment without it.
  if (userIds.length > 1) await requireCapability('course.bulk_assign');
  const db = await getServerSupabase();
  if (options.required && !options.dueDate) {
    return { ok: false, error: 'Required training needs a date it is due by.' };
  }
  return run(
    () => courseService
      .assignCourse(db, session.organisationId, session.userId, courseId, userIds, options)
      .then(() => undefined),
    ['/courses', `/courses/${courseId}`, '/dashboard', '/analytics'],
  );
}

export async function unassignCourseAction(assignmentId: string, courseId: string): Promise<ActionResult> {
  await requireCapability('course.assign');
  const db = await getServerSupabase();
  return run(() => courseService.unassignCourse(db, assignmentId), ['/courses', `/courses/${courseId}`]);
}

export async function updateProgressAction(assignmentId: string, progress: number): Promise<ActionResult> {
  const session = await requireCapability('course.update_progress');
  const db = await getServerSupabase();
  return run(async () => {
    const { data, error } = await db.from('course_assignments').select('*').eq('id', assignmentId).single();
    if (error) throw error;
    await courseService.updateAssignmentProgress(db, data as any, progress, session.userId);
  }, ['/courses', '/dashboard']);
}

// ---------------------------------------------------------------- tasks
export async function createTaskAction(input: any): Promise<ActionResult> {
  const session = await requireCapability('task.create');
  // Assigning to another person is a separate grant from writing the task.
  if (input?.assigned_to) await requireCapability('task.assign');
  const db = await getServerSupabase();
  return run(async () => {
    const task = await taskService.createTask(db, session.organisationId, session.userId, {
      title: input.title,
      description: input.description || null,
      assigned_to: input.assigned_to || null,
      course_id: input.course_id || null,
      status: input.status,
      priority: input.priority,
      due_date: input.due_date || null,
    });
    return task.id;
  }, ['/tasks', '/dashboard']);
}

export async function updateTaskAction(id: string, patch: any): Promise<ActionResult> {
  await requireCapability('task.edit');
  // Assigning to another person is a separate grant from writing the task.
  if (patch?.assigned_to) await requireCapability('task.assign');
  const db = await getServerSupabase();
  return run(() => taskService.updateTask(db, id, patch).then(() => undefined), ['/tasks', `/tasks/${id}`]);
}

export async function setTaskStatusAction(id: string, status: any): Promise<ActionResult> {
  const session = await requireCapability('task.complete');
  const db = await getServerSupabase();
  return run(async () => {
    const task = await taskService.getTask(db, id);
    if (!task) throw new Error('That task no longer exists.');
    await taskService.setTaskStatus(db, task, status, session.userId);
  }, ['/tasks', `/tasks/${id}`, '/dashboard']);
}

export async function bulkAssignTasksAction(ids: string[], assignedTo: string): Promise<ActionResult> {
  await requireCapability('task.bulk_assign');
  const db = await getServerSupabase();
  return run(() => taskService.bulkAssignTasks(db, ids, assignedTo), ['/tasks']);
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  await requireCapability('task.delete');
  const db = await getServerSupabase();
  return run(() => taskService.deleteTask(db, id), ['/tasks']);
}

// ---------------------------------------------------------------- events
export async function createEventAction(input: any): Promise<ActionResult> {
  const session = await requireCapability('event.create');
  const db = await getServerSupabase();
  return run(async () => {
    const event = await eventService.createEvent(db, session.organisationId, session.userId, {
      title: input.title,
      description: input.description || null,
      start_time: new Date(input.start_time).toISOString(),
      end_time: input.end_time ? new Date(input.end_time).toISOString() : null,
      location: input.location || null,
    });
    if (input.participants?.length) {
      await eventService.setParticipants(db, session.organisationId, event.id, input.participants);
    }
    return event.id;
  }, ['/events', '/dashboard']);
}

export async function updateEventAction(id: string, patch: any, participants?: string[]): Promise<ActionResult> {
  const session = await requireCapability('event.edit');
  const db = await getServerSupabase();
  return run(async () => {
    await eventService.updateEvent(db, id, patch);
    if (participants) await eventService.setParticipants(db, session.organisationId, id, participants);
  }, ['/events', `/events/${id}`]);
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  await requireCapability('event.delete');
  const db = await getServerSupabase();
  return run(() => eventService.deleteEvent(db, id), ['/events']);
}

export async function rsvpAction(eventId: string, response: any): Promise<ActionResult> {
  const session = await requireCapability('event.rsvp');
  const db = await getServerSupabase();
  return run(
    () => eventService.respondToEvent(db, session.organisationId, eventId, session.userId, response).then(() => undefined),
    ['/events', `/events/${eventId}`],
  );
}

// ---------------------------------------------------------------- documents
export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' };
  const db = await getServerSupabase();
  const { data, error } = await db.from('documents').select('*').eq('id', id).single();
  if (error) return { ok: false, error: friendlyError(error) };

  // Removing your own upload needs no permission — it is your file, and RLS
  // says so. Removing anyone else's is the destructive act, and that is what
  // `document.delete` grants.
  const own = (data as { owner_id: string | null }).owner_id === session.userId;
  if (!own && !sessionCan(session, 'document.delete')) {
    return { ok: false, error: 'You do not have permission to delete this document.' };
  }

  return run(() => documentService.deleteDocument(db, data as any), ['/documents']);
}

export async function updateDocumentAction(id: string, patch: any): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' };
  const db = await getServerSupabase();
  return run(() => documentService.updateDocument(db, id, patch).then(() => undefined), ['/documents']);
}

// ---------------------------------------------------------------- onboarding
export async function saveTemplateAction(input: {
  id?: string;
  name: string;
  description?: string;
  steps: { title: string; description?: string | null; type: StepType; required: boolean }[];
}): Promise<ActionResult> {
  const session = await requireCapability('onboarding.template.manage');
  const db = await getServerSupabase();
  return run(async () => {
    const template = input.id
      ? await onboardingService.updateTemplate(db, input.id, { name: input.name, description: input.description ?? null })
      : await onboardingService.createTemplate(db, session.organisationId, session.userId, {
          name: input.name, description: input.description ?? null,
        });
    await onboardingService.replaceTemplateSteps(db, session.organisationId, template.id, input.steps);
    return template.id;
  }, ['/onboarding/templates', '/onboarding']);
}

export async function duplicateTemplateAction(id: string): Promise<ActionResult> {
  const session = await requireCapability('onboarding.template.manage');
  const db = await getServerSupabase();
  return run(
    () => onboardingService.duplicateTemplate(db, session.organisationId, session.userId, id).then((t) => t.id),
    ['/onboarding/templates'],
  );
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  await requireCapability('onboarding.template.delete');
  const db = await getServerSupabase();
  return run(() => onboardingService.deleteTemplate(db, id), ['/onboarding/templates']);
}

export async function startOnboardingAction(input: {
  employeeId: string; templateId: string; startDate?: string; targetDate?: string;
}): Promise<ActionResult> {
  const session = await requireCapability('onboarding.create');
  const db = await getServerSupabase();
  return run(
    () => onboardingService.startOnboarding(db, session.organisationId, session.userId, {
      employeeId: input.employeeId,
      templateId: input.templateId,
      startDate: input.startDate || null,
      targetDate: input.targetDate || null,
    }).then((p) => p.id),
    ['/onboarding', '/dashboard', '/employees'],
  );
}

export async function completeStepAction(stepId: string, complete: boolean): Promise<ActionResult> {
  const session = await requireCapability('onboarding.complete');
  const db = await getServerSupabase();
  return run(async () => {
    if (!complete) {
      await onboardingService.reopenStep(db, stepId);
      return;
    }
    const { data, error } = await db.from('onboarding_steps').select('*').eq('id', stepId).single();
    if (error) throw error;
    await onboardingService.completeStep(db, data as any, session.userId);
  }, ['/onboarding', '/dashboard']);
}

export async function deleteOnboardingAction(id: string): Promise<ActionResult> {
  await requireCapability('onboarding.delete');
  const db = await getServerSupabase();
  return run(() => onboardingService.deleteOnboarding(db, id), ['/onboarding']);
}

// ---------------------------------------------------------------- employees
export async function updateEmployeeAction(id: string, patch: any): Promise<ActionResult> {
  await requireCapability('employee.edit');
  const db = await getServerSupabase();
  return run(
    () => employeeService.updateEmployee(db, id, patch).then(() => undefined),
    ['/employees', `/employees/${id}`],
  );
}

export async function setEmployeeActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  await requireCapability('employee.deactivate');
  const db = await getServerSupabase();
  return run(
    () => employeeService.setEmployeeActive(db, id, isActive).then(() => undefined),
    ['/employees', `/employees/${id}`, '/reports', '/tasks'],
  );
}

/**
 * What a leaver leaves behind.
 *
 * Deactivating someone was a single flag, which is not what happens when a
 * person leaves: their open tasks stay assigned to an account nobody reads, and
 * their unfinished onboarding sits in the plan. Someone has to pick that work
 * up, and the first step is being able to see it.
 */
export async function handoverSummaryAction(id: string): Promise<{
  tasks: number; requiredTraining: number; onboarding: number;
}> {
  await requireCapability('employee.view_all');
  const db = await getServerSupabase();

  const [tasks, training, onboarding] = await Promise.all([
    db.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assigned_to', id).neq('status', 'Completed'),
    db.from('course_assignments').select('id', { count: 'exact', head: true })
      .eq('user_id', id).eq('is_required', true).neq('status', 'Completed'),
    db.from('employee_onboarding').select('id', { count: 'exact', head: true })
      .eq('employee_id', id).neq('status', 'Completed'),
  ]);

  return {
    tasks: tasks.count ?? 0,
    requiredTraining: training.count ?? 0,
    onboarding: onboarding.count ?? 0,
  };
}

/** Moves a leaver's unfinished tasks to someone who is still here. */
export async function reassignTasksAction(fromId: string, toId: string): Promise<ActionResult> {
  await requireCapability('task.assign');
  const db = await getServerSupabase();
  return run(async () => {
    const { error } = await db.from('tasks')
      .update({ assigned_to: toId })
      .eq('assigned_to', fromId)
      .neq('status', 'Completed');
    if (error) throw error;
  }, ['/tasks', '/employees', `/employees/${fromId}`, `/employees/${toId}`]);
}

// ---------------------------------------------------------------- departments
export async function saveDepartmentAction(input: {
  id?: string; name: string; description?: string; manager_id?: string | null;
}): Promise<ActionResult> {
  const session = await requireCapability('department.manage');
  const db = await getServerSupabase();
  return run(async () => {
    if (input.id) {
      await employeeService.updateDepartment(db, input.id, {
        name: input.name, description: input.description ?? null, manager_id: input.manager_id ?? null,
      });
      return input.id;
    }
    const dept = await employeeService.createDepartment(db, session.organisationId, {
      name: input.name, description: input.description ?? null, manager_id: input.manager_id ?? null,
    });
    return dept.id;
  }, ['/departments', '/settings', '/analytics']);
}

export async function deleteDepartmentAction(id: string): Promise<ActionResult> {
  await requireCapability('department.delete');
  const db = await getServerSupabase();
  return run(() => employeeService.deleteDepartment(db, id), ['/departments', '/settings']);
}

// ---------------------------------------------------------------- profile
export async function updateOwnProfileAction(patch: {
  name?: string; phone?: string; job_title?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' };
  const db = await getServerSupabase();
  return run(async () => {
    const { error } = await db.from('profiles').update(patch).eq('id', session.userId);
    if (error) throw error;
  }, ['/profile', '/dashboard']);
}

// ---------------------------------------------------------------- roles
export async function saveRoleAction(input: {
  id?: string;
  name: string;
  description?: string;
  base_role: 'employee' | 'admin';
  permissions: string[];
}): Promise<ActionResult> {
  const session = await requireCapability('user.role_management');
  const db = await getServerSupabase();

  if (input.name.trim().length < 2) {
    return { ok: false, error: 'Give the role a name.' };
  }
  // Editing the role you hold is escalation (grant yourself more) or lockout
  // (drop the permission that got you here). The database refuses it too; this
  // check exists so the refusal arrives as a sentence rather than a constraint.
  if (input.id && input.id === session.profile.role_id && !sessionCan(session, 'user.role_management_self')) {
    return { ok: false, error: 'You cannot edit the role you are assigned to. Ask a Super Administrator.' };
  }
  // A role can never grant more than its tier is allowed to do, because the
  // tier is what the database enforces.
  const ceiling = new Set(capabilitiesForTier(input.base_role) as string[]);
  const permissions = input.permissions.filter((p) => ceiling.has(p));

  return run(async () => {
    if (input.id) {
      await roleService.updateRole(db, input.id, {
        name: input.name.trim(),
        description: input.description ?? null,
        base_role: input.base_role,
        permissions,
      });
      return input.id;
    }
    const role = await roleService.createRole(db, session.organisationId, {
      name: input.name.trim(),
      description: input.description ?? null,
      base_role: input.base_role,
      permissions,
    });
    return role.id;
  }, ['/settings/roles', '/settings', '/employees']);
}

export async function deleteRoleAction(id: string): Promise<ActionResult> {
  const session = await requireCapability('user.role_management');
  const db = await getServerSupabase();

  const role = await roleService.getRole(db, id);
  if (role?.is_system) {
    return { ok: false, error: 'System roles cannot be deleted.' };
  }
  if (id === session.profile.role_id && !sessionCan(session, 'user.role_management_self')) {
    return { ok: false, error: 'You cannot delete the role you are assigned to.' };
  }
  const holders = await roleService.countHolders(db, id);
  if (holders > 0) {
    return {
      ok: false,
      error: `${holders} ${holders === 1 ? 'person is' : 'people are'} on this role. Move them to another role first.`,
    };
  }
  return run(() => roleService.deleteRole(db, id), ['/settings/roles', '/settings']);
}

export async function assignRoleAction(userId: string, roleId: string): Promise<ActionResult> {
  const session = await requireCapability('user.role_management');
  const db = await getServerSupabase();

  // Moving yourself between roles is escalation by another route.
  if (userId === session.userId && !sessionCan(session, 'user.role_management_self')) {
    return { ok: false, error: 'You cannot change your own role. Ask a Super Administrator.' };
  }
  return run(
    () => roleService.assignRole(db, userId, roleId),
    ['/settings', '/settings/roles', '/employees', `/employees/${userId}`],
  );
}

// ---------------------------------------------------------------- notifications
export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const db = await getServerSupabase();
  // No ownership check here on purpose: RLS restricts the update to the
  // caller's own rows, so a forged id simply matches nothing.
  return run(() => notificationService.markRead(db, id), []);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const session = await requireSession();
  const db = await getServerSupabase();
  return run(() => notificationService.markAllRead(db, session.userId), []);
}

// ---------------------------------------------------------------- acknowledgements
/**
 * Records that this person has read a document.
 *
 * Only ever about the caller: the policy allows an insert for `auth.uid()` and
 * nothing else, so one person cannot acknowledge on another's behalf. That is
 * the entire value of the record.
 */
export async function acknowledgeDocumentAction(documentId: string): Promise<ActionResult> {
  const session = await requireCapability('document.acknowledge');
  const db = await getServerSupabase();
  return run(
    () => acknowledgementService.acknowledge(db, documentId, session.userId, session.organisationId),
    ['/documents', '/dashboard'],
  );
}

/** Marks a document as one everybody has to read, or stops requiring it. */
export async function setDocumentAcknowledgementAction(
  documentId: string, required: boolean,
): Promise<ActionResult> {
  await requireCapability('document.require_acknowledgement');
  const db = await getServerSupabase();
  return run(async () => {
    const { error } = await db
      .from('documents')
      .update({ requires_acknowledgement: required })
      .eq('id', documentId);
    if (error) throw error;
  }, ['/documents', '/reports']);
}

// ---------------------------------------------------------------- verification
/**
 * Confirms — or withdraws confirmation — that required training was done.
 *
 * The learner's own progress figure is left alone. This is a second, separate
 * fact: somebody with the authority to say so agreed with it.
 */
export async function verifyAssignmentAction(
  assignmentId: string, verified: boolean,
): Promise<ActionResult> {
  const session = await requireCapability('course.verify');
  const db = await getServerSupabase();
  return run(
    () => courseService.setVerification(db, assignmentId, verified ? session.userId : null),
    ['/reports', '/courses', '/employees'],
  );
}

// ---------------------------------------------------------------- bulk assignment
/** Assigns a course to everyone currently in a department. */
export async function assignCourseToDepartmentAction(
  courseId: string,
  departmentId: string,
  options: { required?: boolean; dueDate?: string | null } = {},
): Promise<ActionResult> {
  const session = await requireCapability('course.assign');
  await requireCapability('course.bulk_assign');
  const db = await getServerSupabase();

  if (options.required && !options.dueDate) {
    return { ok: false, error: 'Required training needs a date it is due by.' };
  }

  const members = await courseService.listDepartmentMembers(db, departmentId);
  if (members.length === 0) {
    return { ok: false, error: 'Nobody is currently in that department.' };
  }

  return run(
    () => courseService
      .assignCourse(db, session.organisationId, session.userId, courseId, members.map((m) => m.id), options)
      .then(() => undefined),
    ['/courses', `/courses/${courseId}`, '/dashboard', '/analytics', '/reports'],
  );
}

// ---------------------------------------------------------------- document requests
/** Asks one person for one document. */
export async function requestDocumentAction(input: {
  employeeId: string; title: string; instructions?: string;
  templateDocumentId?: string | null; dueDate?: string | null;
}): Promise<ActionResult> {
  const session = await requireCapability('document.request');
  const db = await getServerSupabase();
  if (input.title.trim().length < 2) return { ok: false, error: 'Give the request a title.' };

  return run(async () => {
    const request = await documentRequestService.create(db, {
      organisationId: session.organisationId,
      employeeId: input.employeeId,
      requestedBy: session.userId,
      title: input.title.trim(),
      instructions: input.instructions,
      templateDocumentId: input.templateDocumentId,
      dueDate: input.dueDate,
    });
    return request.id;
  }, ['/employees', `/employees/${input.employeeId}`, '/documents', '/reports']);
}

/** Accepts a returned document, or sends it back with a reason. */
export async function reviewDocumentRequestAction(
  requestId: string, accepted: boolean, note?: string,
): Promise<ActionResult> {
  const session = await requireCapability('document.request');
  const db = await getServerSupabase();
  if (!accepted && !note?.trim()) {
    // Sending something back without saying why guarantees it comes back wrong
    // a second time.
    return { ok: false, error: 'Say what needs correcting before sending it back.' };
  }
  return run(
    () => documentRequestService.review(db, requestId, session.userId, accepted, note?.trim()),
    ['/employees', '/documents', '/reports'],
  );
}

/** Raises every request in a checklist for one person. */
export async function applyChecklistAction(
  checklistId: string, employeeId: string, startDate?: string,
): Promise<ActionResult> {
  await requireCapability('document.request');
  const db = await getServerSupabase();
  return run(async () => {
    const raised = await documentRequestService.applyChecklist(db, checklistId, employeeId, startDate);
    if (raised === 0) throw new Error('Everything on that checklist has already been asked for.');
  }, ['/employees', `/employees/${employeeId}`, '/reports']);
}

/** Keeps what was asked of one person as a reusable checklist. */
export async function saveChecklistFromEmployeeAction(
  employeeId: string, name: string, kind: 'Onboarding' | 'Offboarding',
): Promise<ActionResult> {
  await requireCapability('document.request');
  const db = await getServerSupabase();
  if (name.trim().length < 2) return { ok: false, error: 'Give the checklist a name.' };
  return run(async () => {
    const id = await documentRequestService.saveAsChecklist(db, employeeId, name.trim(), kind);
    return id;
  }, ['/settings', '/employees']);
}

/** Sets or clears the rule that a checklist is raised automatically on joining. */
export async function setChecklistAutomationAction(
  checklistId: string, departmentId: string | null,
): Promise<ActionResult> {
  const session = await requireCapability('document.request');
  const db = await getServerSupabase();
  return run(
    () => documentRequestService.setAutomation(db, {
      organisationId: session.organisationId,
      checklistId,
      departmentId,
      createdBy: session.userId,
    }),
    ['/settings'],
  );
}

export async function removeChecklistAutomationAction(id: string): Promise<ActionResult> {
  await requireCapability('document.request');
  const db = await getServerSupabase();
  return run(() => documentRequestService.removeAutomation(db, id), ['/settings']);
}

// ---------------------------------------------------------------- bulk verification
/**
 * Verifies several completed courses at once.
 *
 * Verifying one row at a time is the difference between a queue that gets
 * cleared and one that grows: after a group session, thirty people finished the
 * same course on the same afternoon.
 */
export async function verifyAssignmentsAction(assignmentIds: string[]): Promise<ActionResult> {
  const session = await requireCapability('course.verify');
  const db = await getServerSupabase();
  if (assignmentIds.length === 0) return { ok: false, error: 'Nothing selected.' };

  return run(async () => {
    const { error } = await db.from('course_assignments').update({
      verified_at: new Date().toISOString(),
      verified_by: session.userId,
    }).in('id', assignmentIds);
    if (error) throw error;
  }, ['/reports', '/courses', '/employees']);
}

// ---------------------------------------------------------------- checklists
export async function saveChecklistAction(input: {
  id?: string;
  name: string;
  description?: string;
  kind: 'Onboarding' | 'Offboarding';
  items: { title: string; instructions?: string; templateDocumentId?: string | null; dueAfterDays: number }[];
}): Promise<ActionResult> {
  const session = await requireCapability('document.request');
  const db = await getServerSupabase();

  if (input.name.trim().length < 2) return { ok: false, error: 'Give the checklist a name.' };
  const items = input.items.filter((item) => item.title.trim().length > 0);
  if (items.length === 0) {
    // A checklist with no items applies cleanly and asks for nothing, which
    // looks like it worked.
    return { ok: false, error: 'Add at least one document to the checklist.' };
  }

  return run(async () => {
    const id = await checklistService.save(db, {
      id: input.id,
      organisationId: session.organisationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      kind: input.kind,
      createdBy: session.userId,
    });
    await checklistService.replaceItems(db, session.organisationId, id, items.map((item) => ({
      title: item.title.trim(),
      instructions: item.instructions?.trim() || null,
      templateDocumentId: item.templateDocumentId || null,
      dueAfterDays: Number.isFinite(item.dueAfterDays) ? item.dueAfterDays : 7,
    })));
    return id;
  }, ['/settings/checklists', '/settings', '/employees']);
}

export async function deleteChecklistAction(id: string): Promise<ActionResult> {
  await requireCapability('document.request');
  const db = await getServerSupabase();
  return run(() => checklistService.remove(db, id), ['/settings/checklists', '/settings']);
}

// ---------------------------------------------------------------- credentials
/**
 * Records the outcome of checking a credential.
 *
 * Accepting one requires saying how it was checked: "Verified" with no account
 * of the check is the first thing questioned when a placement is challenged,
 * and the database refuses it regardless of what this passes.
 */
export async function reviewCredentialAction(input: {
  id: string; accepted: boolean; method?: string; originalSighted?: boolean; note?: string;
}): Promise<ActionResult> {
  const session = await requireCapability('credential.verify');
  const db = await getServerSupabase();

  if (input.accepted && !input.method?.trim()) {
    return { ok: false, error: 'Record how you checked this before accepting it.' };
  }
  if (!input.accepted && !input.note?.trim()) {
    return { ok: false, error: 'Say why it was not accepted.' };
  }

  return run(
    () => credentialService.review(db, input.id, session.userId, {
      accepted: input.accepted,
      method: input.method?.trim(),
      originalSighted: input.originalSighted,
      note: input.note?.trim(),
    }),
    ['/employees', `/employees/${input.id}`, '/reports', '/profile'],
  );
}

/** Marks lapsed credentials expired, and tells the person and their manager. */
export async function sweepExpiredCredentialsAction(): Promise<ActionResult> {
  await requireCapability('credential.verify');
  const db = await getServerSupabase();
  return run(async () => {
    await credentialService.sweepExpired(db);
  }, ['/reports', '/employees']);
}

// ---------------------------------------------------------------- clearing the queue in batches
/**
 * Accepts several certificates at once, all checked the same way.
 *
 * How each one was checked is still recorded per record, because that is the
 * part that has to stand up later — the batch is a saving in clicks, not in
 * evidence. Sending one back still happens one at a time: a rejection needs a
 * reason, and a reason shared by thirty records is not a reason.
 */
export async function reviewCredentialsAction(
  ids: string[], method: string, originalSighted = false,
): Promise<ActionResult> {
  const session = await requireCapability('credential.verify');
  const db = await getServerSupabase();

  if (ids.length === 0) return { ok: false, error: 'Nothing selected.' };
  if (!method.trim()) return { ok: false, error: 'Record how you checked these before accepting them.' };

  return run(async () => {
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await credentialService.review(db, id, session.userId, {
          accepted: true, method: method.trim(), originalSighted,
        });
      } catch {
        failures.push(id);
      }
    }
    // One refusal in a batch of thirty must not read as thirty refusals, nor as
    // a clean run.
    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${ids.length} could not be accepted. The rest went through.`);
    }
  }, ['/worklist', '/reports', '/employees', '/profile']);
}

/** Accepts several returned documents at once. */
export async function reviewDocumentRequestsAction(ids: string[]): Promise<ActionResult> {
  const session = await requireCapability('document.request');
  const db = await getServerSupabase();
  if (ids.length === 0) return { ok: false, error: 'Nothing selected.' };

  return run(async () => {
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await documentRequestService.review(db, id, session.userId, true);
      } catch {
        failures.push(id);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${ids.length} could not be accepted. The rest went through.`);
    }
  }, ['/worklist', '/reports', '/employees', '/documents']);
}

// ---------------------------------------------------------------- saved views
/** Names the current filter so it can be reached in one click tomorrow. */
export async function saveViewAction(input: {
  name: string; path: string; query: string; isShared?: boolean;
}): Promise<ActionResult> {
  const session = await requireSession();
  const db = await getServerSupabase();
  if (!input.name.trim()) return { ok: false, error: 'Give the view a name.' };

  return run(
    () => saveView(db, {
      organisationId: session.organisationId,
      ownerId: session.userId,
      name: input.name,
      path: input.path,
      query: input.query,
      isShared: input.isShared,
    }),
    [input.path],
  );
}

export async function deleteSavedViewAction(id: string, path: string): Promise<ActionResult> {
  await requireSession();
  const db = await getServerSupabase();
  return run(() => deleteSavedView(db, id), [path]);
}

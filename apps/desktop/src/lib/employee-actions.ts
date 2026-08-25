'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import {
  courseService, documentRequestService, employeeService, employeeSchema, friendlyError,
  onboardingService,
} from '@snoopy/shared';
import type { ActionResult } from './actions';
import { requireAdmin } from './session';
import { getServerSupabase } from './supabase-server';

/**
 * Creating an employee needs an auth user, which the anon key cannot mint.
 * The service role key is read here, on the server, and never reaches the
 * browser. The organisation is taken from the caller's own session — never
 * from the form — so an admin cannot create a user inside another tenant.
 */
export async function createEmployeeAction(input: {
  name: string; email: string; password: string; role: 'employee' | 'admin';
  job_title?: string; department_id?: string; manager_id?: string; start_date?: string; phone?: string;
  employment_hours?: 'Full-time' | 'Part-time' | 'Casual';
  employment_basis?: 'Ongoing' | 'Fixed term' | 'Casual';
  /**
   * Their first week, set up in the same submit.
   *
   * Adding somebody used to end with "assign an onboarding plan next", which
   * meant four screens: create them, open their record, start the plan, apply
   * the document pack, then assign training one course at a time. Every one of
   * those is a place to stop, and the person who stops is usually interrupted
   * rather than finished.
   */
  onboardingTemplateId?: string;
  checklistId?: string;
  requiredCourseIds?: string[];
  trainingDueInDays?: number;
}): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = employeeSchema.safeParse({
    ...input,
    job_title: input.job_title || null,
    department_id: input.department_id || null,
    manager_id: input.manager_id || null,
    start_date: input.start_date || null,
    phone: input.phone || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }
  if (input.password.length < 8) {
    return { ok: false, error: 'Temporary password must be at least 8 characters.' };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { ok: false, error: 'Employee creation is not configured on this server.' };
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: input.email.trim(),
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (authError) throw authError;

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      organisation_id: session.organisationId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      job_title: parsed.data.job_title,
      department_id: parsed.data.department_id,
      manager_id: parsed.data.manager_id,
      start_date: parsed.data.start_date,
      employment_hours: parsed.data.employment_hours,
      employment_basis: parsed.data.employment_basis,
      phone: parsed.data.phone,
    });
    if (profileError) {
      // Do not leave an auth user without a profile behind.
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    const db = await getServerSupabase();
    await employeeService.recordEmployeeCreated(db, session.organisationId, session.userId, {
      id: created.user.id, name: parsed.data.name,
    } as any);

    /*
     * The rest of the setup runs through the caller's own session rather than
     * the service client, so it obeys the same permissions as doing it by hand.
     * An administrator who may not assign courses does not gain that by using
     * this form.
     */
    const setupProblems: string[] = [];

    if (input.onboardingTemplateId) {
      try {
        await onboardingService.startOnboarding(db, session.organisationId, session.userId, {
          employeeId: created.user.id,
          templateId: input.onboardingTemplateId,
          startDate: parsed.data.start_date ?? undefined,
        });
      } catch (error) {
        setupProblems.push(`onboarding plan (${friendlyError(error)})`);
      }
    }

    if (input.checklistId) {
      try {
        await documentRequestService.applyChecklist(
          db, input.checklistId, created.user.id, parsed.data.start_date ?? undefined,
        );
      } catch (error) {
        setupProblems.push(`document checklist (${friendlyError(error)})`);
      }
    }

    if (input.requiredCourseIds?.length) {
      const due = new Date();
      due.setDate(due.getDate() + (input.trainingDueInDays ?? 30));
      for (const courseId of input.requiredCourseIds) {
        try {
          await courseService.assignCourse(
            db, session.organisationId, session.userId, courseId, [created.user.id],
            { required: true, dueDate: due.toISOString().slice(0, 10) },
          );
        } catch (error) {
          setupProblems.push(`training (${friendlyError(error)})`);
          break;
        }
      }
    }

    revalidatePath('/employees');
    revalidatePath('/dashboard');
    revalidatePath('/worklist');

    // The account exists either way; saying so plainly beats a generic failure
    // that leaves somebody wondering whether to add them again.
    if (setupProblems.length > 0) {
      return {
        ok: true,
        id: created.user.id,
        warning: `${parsed.data.name} was added, but this did not run: ${setupProblems.join(', ')}.`,
      } as ActionResult;
    }

    return { ok: true, id: created.user.id };
  } catch (error) {
    const message = friendlyError(error);
    return {
      ok: false,
      error: /already been registered|duplicate/i.test(message)
        ? 'An account with that email already exists.'
        : message,
    };
  }
}

/**
 * Invites someone by email instead of handing out a temporary password.
 * Supabase sends the invitation; locally it lands in Mailpit on port 54324.
 * The profile is created immediately so the person shows up in the workspace
 * as invited, with the organisation taken from the caller's session.
 */
export async function inviteEmployeeAction(input: {
  name: string; email: string; roleId: string;
  job_title?: string; department_id?: string; manager_id?: string; start_date?: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();

  if (!input.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    return { ok: false, error: 'Enter a name and a valid email address.' };
  }
  if (!input.roleId) return { ok: false, error: 'Choose a role for the new user.' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, error: 'Invitations are not configured on this server.' };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const db = await getServerSupabase();
    const { data: role, error: roleError } = await db
      .from('roles').select('id, base_role').eq('id', input.roleId).single();
    if (roleError) throw roleError;

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      input.email.trim(), { data: { name: input.name.trim() } },
    );
    if (inviteError) throw inviteError;

    const { error: profileError } = await admin.from('profiles').insert({
      id: invited.user.id,
      organisation_id: session.organisationId,
      name: input.name.trim(),
      email: input.email.trim(),
      role: role.base_role,
      role_id: role.id,
      job_title: input.job_title || null,
      department_id: input.department_id || null,
      manager_id: input.manager_id || null,
      start_date: input.start_date || null,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      throw profileError;
    }

    await employeeService.recordEmployeeCreated(db, session.organisationId, session.userId, {
      id: invited.user.id, name: input.name.trim(),
    } as any);

    revalidatePath('/employees');
    revalidatePath('/settings');
    return { ok: true, id: invited.user.id };
  } catch (error) {
    const message = friendlyError(error);
    return {
      ok: false,
      error: /already been registered|duplicate/i.test(message)
        ? 'Someone with that email already has an account.'
        : message,
    };
  }
}

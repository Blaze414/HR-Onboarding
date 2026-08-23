import type { Db } from '../supabase';
import type {
  EmployeeOnboarding, OnboardingStep, OnboardingTemplate, OnboardingTemplateStep, PlanKind, StepType,
} from '../types';
import { logActivity } from './activity';

// ------------------------------------------------------------- templates
export async function listTemplates(db: Db): Promise<OnboardingTemplate[]> {
  const { data, error } = await db
    .from('onboarding_templates')
    .select('*, steps:onboarding_template_steps(*)')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    steps: (t.steps ?? []).sort((a: OnboardingTemplateStep, b: OnboardingTemplateStep) => a.sort_order - b.sort_order),
  })) as OnboardingTemplate[];
}

export async function getTemplate(db: Db, id: string): Promise<OnboardingTemplate | null> {
  const { data, error } = await db
    .from('onboarding_templates')
    .select('*, steps:onboarding_template_steps(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const t = data as any;
  t.steps = (t.steps ?? []).sort((a: OnboardingTemplateStep, b: OnboardingTemplateStep) => a.sort_order - b.sort_order);
  return t as OnboardingTemplate;
}

export async function createTemplate(
  db: Db, organisationId: string, actorId: string, input: { name: string; description?: string | null },
): Promise<OnboardingTemplate> {
  const { data, error } = await db.from('onboarding_templates')
    .insert({ ...input, organisation_id: organisationId, created_by: actorId })
    .select('*').single();
  if (error) throw error;
  return data as OnboardingTemplate;
}

export async function updateTemplate(db: Db, id: string, patch: Partial<OnboardingTemplate>) {
  const { data, error } = await db.from('onboarding_templates')
    .update({ name: patch.name, description: patch.description }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as OnboardingTemplate;
}

export async function deleteTemplate(db: Db, id: string) {
  const { error } = await db.from('onboarding_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateTemplate(
  db: Db, organisationId: string, actorId: string, templateId: string,
): Promise<OnboardingTemplate> {
  const source = await getTemplate(db, templateId);
  if (!source) throw new Error('Template not found');
  const copy = await createTemplate(db, organisationId, actorId, {
    name: `${source.name} (copy)`, description: source.description,
  });
  if (source.steps?.length) {
    await replaceTemplateSteps(db, organisationId, copy.id, source.steps.map((s) => ({
      title: s.title, description: s.description, type: s.type, required: s.required,
    })));
  }
  return copy;
}

/**
 * The template editor saves the whole step list at once, which keeps
 * reordering, adding and deleting to a single round trip.
 */
export async function replaceTemplateSteps(
  db: Db, organisationId: string, templateId: string,
  steps: { title: string; description?: string | null; type: StepType; required: boolean }[],
) {
  const { error: delError } = await db.from('onboarding_template_steps')
    .delete().eq('onboarding_template_id', templateId);
  if (delError) throw delError;
  if (steps.length === 0) return;
  const { error } = await db.from('onboarding_template_steps').insert(
    steps.map((s, index) => ({
      organisation_id: organisationId,
      onboarding_template_id: templateId,
      title: s.title,
      description: s.description ?? null,
      type: s.type,
      required: s.required,
      sort_order: index + 1,
    })),
  );
  if (error) throw error;
}

// ------------------------------------------------------------- employee plans
const PLAN_SELECT =
  '*, employee:profiles!employee_onboarding_employee_id_fkey(id,name,job_title,department_id), template:onboarding_templates(id,name)';

export async function listOnboarding(db: Db): Promise<EmployeeOnboarding[]> {
  const { data, error } = await db.from('employee_onboarding')
    .select(PLAN_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeOnboarding[];
}

export async function getOnboarding(db: Db, id: string): Promise<EmployeeOnboarding | null> {
  const { data, error } = await db.from('employee_onboarding')
    .select(`${PLAN_SELECT}, steps:onboarding_steps(*)`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const plan = data as any;
  plan.steps = (plan.steps ?? []).sort((a: OnboardingStep, b: OnboardingStep) => a.sort_order - b.sort_order);
  return plan as EmployeeOnboarding;
}

export async function getMyOnboarding(db: Db, employeeId: string): Promise<EmployeeOnboarding | null> {
  const { data, error } = await db.from('employee_onboarding')
    .select(`${PLAN_SELECT}, steps:onboarding_steps(*)`)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const plan = data as any;
  plan.steps = (plan.steps ?? []).sort((a: OnboardingStep, b: OnboardingStep) => a.sort_order - b.sort_order);
  return plan as EmployeeOnboarding;
}

/** Starting a plan copies the template's steps so later template edits do not rewrite history. */
export async function startOnboarding(
  db: Db,
  organisationId: string,
  actorId: string,
  input: { employeeId: string; templateId: string; startDate?: string | null; targetDate?: string | null },
): Promise<EmployeeOnboarding> {
  const template = await getTemplate(db, input.templateId);
  if (!template) throw new Error('Template not found');

  const { data, error } = await db.from('employee_onboarding').insert({
    organisation_id: organisationId,
    employee_id: input.employeeId,
    template_id: input.templateId,
    // The plan inherits the template's kind, so an exit plan cannot be started
    // from a joining template by passing the wrong flag.
    kind: (template as { kind?: PlanKind }).kind ?? 'Onboarding',
    status: 'Not Started',
    start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
    target_completion_date: input.targetDate ?? null,
    created_by: actorId,
  }).select(PLAN_SELECT).single();
  if (error) throw error;

  if (template.steps?.length) {
    const { error: stepError } = await db.from('onboarding_steps').insert(
      template.steps.map((s) => ({
        organisation_id: organisationId,
        onboarding_id: data.id,
        template_step_id: s.id,
        title: s.title,
        description: s.description,
        type: s.type,
        sort_order: s.sort_order,
        assigned_to: input.employeeId,
        due_date: input.targetDate ?? null,
      })),
    );
    if (stepError) throw stepError;
  }

  await logActivity(db, {
    organisationId, actorId, action: 'started_onboarding',
    entityType: 'employee_onboarding', entityId: data.id,
    metadata: { employee: (data as EmployeeOnboarding).employee?.name },
  });
  return data as EmployeeOnboarding;
}

/**
 * Completing a step. `completed_by` records who actually did it, which is not
 * necessarily the person the step is assigned to.
 */
export async function completeStep(
  db: Db, step: OnboardingStep, actorId: string,
): Promise<OnboardingStep> {
  const { data, error } = await db.from('onboarding_steps').update({
    status: 'Completed',
    completed_at: new Date().toISOString(),
    completed_by: actorId,
  }).eq('id', step.id).select('*').single();
  if (error) throw error;

  await logActivity(db, {
    organisationId: step.organisation_id, actorId, action: 'completed_onboarding_step',
    entityType: 'onboarding_step', entityId: step.id, metadata: { title: step.title },
  });
  return data as OnboardingStep;
}

export async function reopenStep(db: Db, stepId: string): Promise<OnboardingStep> {
  const { data, error } = await db.from('onboarding_steps').update({
    status: 'Pending', completed_at: null, completed_by: null,
  }).eq('id', stepId).select('*').single();
  if (error) throw error;
  return data as OnboardingStep;
}

export async function deleteOnboarding(db: Db, id: string) {
  const { error } = await db.from('employee_onboarding').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Templates of one kind.
 *
 * Leaving is as structured as joining — return the laptop, hand over the
 * accounts, hold the exit conversation — and it was the one lifecycle event with
 * no plan behind it. The steps and progress machinery are identical, so a plan
 * simply carries the kind it is.
 */
export async function listTemplatesOfKind(db: Db, kind: PlanKind) {
  const { data, error } = await db
    .from('onboarding_templates')
    .select('*, steps:onboarding_template_steps(*)')
    .eq('kind', kind)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Plans of one kind for one person, newest first. */
export async function listPlansOfKind(db: Db, employeeId: string, kind: PlanKind) {
  const { data, error } = await db
    .from('employee_onboarding')
    .select('*, template:onboarding_templates(id,name,kind)')
    .eq('employee_id', employeeId)
    .eq('kind', kind)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

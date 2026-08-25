export type UserRole = 'employee' | 'admin';
export type Platform = 'mobile' | 'desktop';

export type CourseStatus = 'Pending' | 'In Progress' | 'Completed' | 'Archived';
export type AssignmentStatus = 'Pending' | 'In Progress' | 'Completed';
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
export type TaskPriority = 'Low' | 'Medium' | 'High';
export type OnboardingStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Overdue';
export type StepStatus = 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
export type StepType = 'Task' | 'Document' | 'Course' | 'Meeting' | 'Form';
export type EventResponse = 'Going' | 'Maybe' | 'Declined';

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
}

export interface Role {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  /** The security tier this role inherits; RLS reads profiles.role, never this list. */
  base_role: UserRole;
  permissions: string[];
  is_system: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  organisation_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  /** Security tier. Kept in sync with role_id by a database trigger. */
  role: UserRole;
  role_id: string | null;
  job_title: string | null;
  department_id: string | null;
  manager_id: string | null;
  start_date: string | null;
  /** The day employment ended. A required particular in its own right. */
  end_date: string | null;
  /** Full-time, part-time or casual — Fair Work Regulations 2009 reg 3.32(c). */
  employment_hours: 'Full-time' | 'Part-time' | 'Casual' | null;
  /** Ongoing, fixed term or casual — the same regulation, the other half. */
  employment_basis: 'Ongoing' | 'Fixed term' | 'Casual' | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  /** Present when the query joins departments. */
  department?: Pick<Department, 'id' | 'name'> | null;
  manager?: Pick<Profile, 'id' | 'name'> | null;
  role_profile?: Pick<Role, 'id' | 'name' | 'permissions' | 'base_role'> | null;
}

export interface Course {
  id: string;
  organisation_id: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  created_by: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface CourseAssignment {
  id: string;
  organisation_id: string;
  course_id: string;
  user_id: string;
  assigned_by: string | null;
  status: AssignmentStatus;
  progress: number;
  assigned_at: string;
  completed_at: string | null;
  /** Required training must be finished; optional training is offered. */
  is_required: boolean;
  due_date: string | null;
  /** When somebody with authority confirmed the learner's own figure. */
  verified_at: string | null;
  verified_by: string | null;
  course?: Course | null;
  user?: Pick<Profile, 'id' | 'name' | 'job_title'> | null;
}

export interface Task {
  id: string;
  organisation_id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  assigned_to: string | null;
  course_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  assignee?: Pick<Profile, 'id' | 'name'> | null;
  course?: Pick<Course, 'id' | 'title'> | null;
}

export interface WorkEvent {
  id: string;
  organisation_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  created_by: string | null;
  participants?: EventParticipant[];
}

export interface EventParticipant {
  id: string;
  organisation_id: string;
  event_id: string;
  user_id: string;
  response: EventResponse | null;
  user?: Pick<Profile, 'id' | 'name'> | null;
}

export interface DocumentRecord {
  /** Staff must record that they have read this. */
  requires_acknowledgement?: boolean;
  /** Bumped by the database whenever the stored file is replaced. Read receipts
   *  are recorded against it, so a new version retires the old ones. */
  version?: number;
  id: string;
  organisation_id: string;
  /** null = shared organisation document, otherwise the owning user. */
  owner_id: string | null;
  uploaded_by: string | null;
  course_id: string | null;
  name: string;
  storage_path: string;
  category: string;
  file_type: string | null;
  description: string | null;
  created_at: string;
  /** Earliest day this may be destroyed — seven years, Fair Work reg 3.31. */
  retain_until?: string;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export interface OnboardingTemplate {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  steps?: OnboardingTemplateStep[];
}

export interface OnboardingTemplateStep {
  id: string;
  organisation_id: string;
  onboarding_template_id: string;
  title: string;
  description: string | null;
  type: StepType;
  sort_order: number;
  required: boolean;
}

export interface EmployeeOnboarding {
  id: string;
  organisation_id: string;
  employee_id: string;
  template_id: string | null;
  status: OnboardingStatus;
  progress: number;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  created_at: string;
  employee?: Pick<Profile, 'id' | 'name' | 'job_title' | 'department_id'> | null;
  template?: Pick<OnboardingTemplate, 'id' | 'name'> | null;
  steps?: OnboardingStep[];
}

export interface OnboardingStep {
  id: string;
  organisation_id: string;
  onboarding_id: string;
  template_step_id: string | null;
  title: string;
  description: string | null;
  type: StepType;
  status: StepStatus;
  sort_order: number;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface ActivityEntry {
  id: string;
  organisation_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Pick<Profile, 'id' | 'name'> | null;
}

// ------------------------------------------------------------- analytics
export interface EmployeeProgress {
  employee_id: string;
  organisation_id: string;
  name: string;
  job_title: string | null;
  department_id: string | null;
  is_active: boolean;
  total_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  pending_courses: number;
  course_progress: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  task_progress: number;
  onboarding_progress: number | null;
  onboarding_status: OnboardingStatus | null;
  overall_progress: number | null;
}

export interface DepartmentProgress {
  department_id: string;
  organisation_id: string;
  name: string;
  employees: number;
  overall_progress: number;
  course_progress: number;
  task_progress: number;
  onboarding_progress: number;
  outstanding_tasks: number;
  overdue_tasks: number;
}

export interface OrganisationProgress {
  organisation_id: string;
  employees: number;
  overall_progress: number;
  course_progress: number;
  task_progress: number;
  onboarding_progress: number;
  overdue_tasks: number;
}

export interface CoursePerformance {
  course_id: string;
  organisation_id: string;
  title: string;
  status: CourseStatus;
  assigned: number;
  completed: number;
  in_progress: number;
  pending: number;
  average_progress: number;
}

export interface AttentionItem {
  employee_id: string;
  name: string;
  reason: string;
}

export type NotificationKind =
  | 'course_assigned' | 'course_due_soon' | 'task_assigned' | 'onboarding_step_assigned'
  | 'event_invited' | 'course_completed' | 'task_completed' | 'onboarding_completed';

export interface AppNotification {
  id: string;
  organisation_id: string;
  /** The recipient. */
  user_id: string;
  /** Who caused it. Never the same person as the recipient. */
  actor_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** Path to open, stored server-side so neither client maps kind to screen. */
  href: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface OutstandingRequiredTraining {
  assignment_id: string;
  organisation_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department_id: string | null;
  department_name: string | null;
  manager_name: string | null;
  course_id: string;
  course_title: string;
  due_date: string;
  progress: number;
  status: AssignmentStatus;
  /** Positive once the date has passed; negative while there is time left. */
  days_overdue: number;
  is_overdue: boolean;
}

export type PlanKind = 'Onboarding' | 'Offboarding';

export interface OutstandingAcknowledgement {
  document_version?: number;
  document_id: string;
  organisation_id: string;
  document_name: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  manager_name: string | null;
  published_at: string;
}

export interface AwaitingVerification {
  assignment_id: string;
  organisation_id: string;
  employee_id: string;
  employee_name: string;
  manager_name: string | null;
  course_id: string;
  course_title: string;
  due_date: string | null;
  completed_at: string | null;
}

export type DocumentRequestStatus = 'Requested' | 'Submitted' | 'Accepted' | 'Returned';

export interface DocumentRequest {
  id: string;
  organisation_id: string;
  employee_id: string;
  requested_by: string | null;
  title: string;
  instructions: string | null;
  template_document_id: string | null;
  submitted_document_id: string | null;
  onboarding_step_id: string | null;
  due_date: string | null;
  status: DocumentRequestStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  employee?: Pick<Profile, 'id' | 'name' | 'email'> | null;
  /** The file to download and sign, where the request has one. */
  template?: { id: string; name: string; storage_path: string } | null;
  /** What came back. */
  submitted?: { id: string; name: string; storage_path: string; created_at: string } | null;
  /** Who accepted or returned it. */
  reviewer?: Pick<Profile, 'id' | 'name'> | null;
}

export interface OutstandingDocumentRequest {
  request_id: string;
  organisation_id: string;
  title: string;
  due_date: string | null;
  status: DocumentRequestStatus;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department_id: string | null;
  department_name: string | null;
  manager_name: string | null;
  is_overdue: boolean;
}

export type CredentialStatus = 'Pending' | 'Verified' | 'Rejected' | 'Expired';

export interface CredentialType {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  requires_expiry: boolean;
  /** How far ahead of expiry to start warning. A three-year certificate needs
   *  longer notice than an annual one. */
  renewal_notice_days: number;
  /** Holds identity documents, so it is read by fewer people. */
  is_sensitive: boolean;
  /** What a checker should look at to confirm it. */
  verification_guidance: string | null;
  departments?: { department_id: string; is_required: boolean }[];
}

export interface EmployeeCredential {
  id: string;
  organisation_id: string;
  employee_id: string;
  credential_type_id: string | null;
  title: string;
  issuer: string | null;
  /** The number on the certificate; without it nobody can re-check it. */
  reference_number: string | null;
  /** Where it was issued — a licence valid in one state may not be in another. */
  jurisdiction: string | null;
  /** Restrictions printed on it, which rostering has to respect. */
  conditions: string | null;
  issued_on: string | null;
  expires_on: string | null;
  document_id: string | null;
  status: CredentialStatus;
  verified_by: string | null;
  verified_at: string | null;
  /** How the check was done. Written by the verifier, never by the subject. */
  verification_method: string | null;
  original_sighted: boolean;
  review_note: string | null;
  created_at: string;
  type?: Pick<CredentialType, 'id' | 'name' | 'requires_expiry' | 'is_sensitive' | 'verification_guidance'> | null;
  employee?: Pick<Profile, 'id' | 'name' | 'email'> | null;
  /** Who recorded the decision. Shown beside when, because a time with no name
   *  answers half the question. */
  verifier?: Pick<Profile, 'id' | 'name'> | null;
  document?: { id: string; name: string; storage_path: string } | null;
}

export interface DepartmentCoverage {
  organisation_id: string;
  department_id: string;
  department_name: string;
  employee_id: string;
  employee_name: string;
  job_title: string | null;
  home_department: string | null;
  credential_type_id: string;
  credential_name: string;
  credential_title: string;
  expires_on: string | null;
  conditions: string | null;
  is_required: boolean;
  /** When the credential behind this cover was checked, and by whom. */
  verified_at: string | null;
  verified_by_name: string | null;
  verification_method: string | null;
}

export interface ExpiringCredential {
  credential_id: string;
  organisation_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  manager_name: string | null;
  department_name: string | null;
  credential_name: string;
  expires_on: string;
  days_left: number;
  has_expired: boolean;
  /** Whether losing it closes a department to them entirely. */
  blocks_a_department: boolean;
}

/**
 * Who to ring. Owned by the person, readable by them and by HR only — which is
 * why it is a table of its own rather than three columns on the staff
 * directory.
 */
export interface EmergencyContact {
  user_id: string;
  organisation_id: string;
  name: string;
  relationship: string | null;
  phone: string;
  updated_at: string;
}

import type { PdfInput } from './documents-pdf';

/**
 * What each kind of document actually says.
 *
 * Every document in this workspace used to be a row pointing at a storage path
 * with nothing behind it. Preview showed "Object not found", the access log
 * recorded reads of nothing, and the retention rule protected nothing. A
 * workspace where the documents are placeholders is a demonstration of a
 * filing cabinet rather than a filing cabinet.
 *
 * These are real documents. They are not legal advice and not templates to
 * adopt — a workplace policy has to be written for the workplace — but they say
 * what the document is for, under what, and what it obliges, which is enough
 * for the app around them to be exercised honestly.
 */

export interface DocumentSubject {
  name: string;
  jobTitle?: string | null;
  startDate?: string | null;
  employmentHours?: string | null;
  employmentBasis?: string | null;
  organisation: string;
}

const PLAIN =
  'This document is part of a demonstration workspace. It describes a real obligation and is '
  + 'structured the way the real thing is, but it is not legal advice and should not be adopted '
  + 'without being written for the workplace it applies to.';

/** An employment agreement carrying the particulars the record already holds. */
export function employmentAgreement(subject: DocumentSubject): PdfInput {
  const casual = subject.employmentBasis === 'Casual';
  const contractor = subject.employmentBasis === 'Contract';

  return {
    title: 'Employment agreement',
    subtitle: `${subject.name} and ${subject.organisation}`,
    sections: [
      {
        heading: 'The particulars',
        rows: [
          ['Employee', subject.name],
          ['Position', subject.jobTitle ?? 'Not recorded'],
          ['Commencement', subject.startDate ?? 'Not recorded'],
          ['Hours', subject.employmentHours ?? 'Not recorded'],
          ['Basis', subject.employmentBasis ?? 'Not recorded'],
        ],
      },
      {
        heading: 'Terms',
        paragraphs: [
          contractor
            ? 'This is an agreement for services. The contractor is not an employee, is responsible '
              + 'for their own tax and superannuation arrangements, and is not entitled to paid leave '
              + 'or to the entitlements of the National Employment Standards.'
            : casual
              ? 'This is casual employment. There is no firm advance commitment to continuing and '
                + 'indefinite work, hours are offered and may be accepted or declined, and a casual '
                + 'loading is paid in place of paid leave entitlements.'
              : 'This is ongoing employment. The National Employment Standards apply and cannot be '
                + 'displaced by this agreement, whatever it says.',
          'Pay is at or above the rate required by the applicable modern award or enterprise '
          + 'agreement, and is reviewed when those rates change. A pay slip is issued within one '
          + 'working day of each payment.',
          'Superannuation is paid at the superannuation guarantee rate in force, to the fund the '
          + 'employee nominates, and is remitted at the same time as wages.',
          casual
            ? 'A casual employee may notify the employer in writing that they want to change to '
              + 'permanent employment once they have been employed for six months - twelve months '
              + 'where the employer is a small business employer. The employer must consult and '
              + 'respond in writing within twenty-one days.'
            : 'Either party may end this agreement by giving the notice required by the National '
              + 'Employment Standards, or payment in lieu of that notice.',
          'Employee records are kept for seven years as required by the Fair Work Regulations 2009. '
          + 'The employee may ask to see their own records at any time.',
        ],
      },
    ],
    footer: PLAIN,
  };
}

/** The workplace policies the register expects to exist. */
const POLICIES: Record<string, PdfInput> = {
  'Right to disconnect': {
    title: 'Right to disconnect',
    subtitle: 'Fair Work Act 2009, section 333M',
    sections: [{
      paragraphs: [
        'An employee may refuse to monitor, read or respond to contact, or attempted contact, from '
        + 'the employer or from a third party outside their working hours, unless the refusal is '
        + 'unreasonable.',
        'Whether a refusal is unreasonable depends on the reason for the contact, how it is made and '
        + 'how disruptive it is, whether the employee is compensated for being available, the nature '
        + 'of their role and level of responsibility, and their personal circumstances including '
        + 'family and caring responsibilities.',
        'This right has applied to every employer since 26 August 2025. Nothing in it prevents '
        + 'contact being made; it governs whether an employee is obliged to respond to it.',
        'Managers should assume that a message sent outside working hours will be read at the start '
        + 'of the next working day, and should say so explicitly when something genuinely cannot '
        + 'wait. Disputes that cannot be resolved at the workplace may be taken to the Fair Work '
        + 'Commission.',
      ],
    }],
    footer: PLAIN,
  },
  'Preventing sexual harassment': {
    title: 'Preventing sexual harassment',
    subtitle: 'Sex Discrimination Act 1984, section 47C - the positive duty',
    sections: [{
      paragraphs: [
        'Sexual harassment, sex-based harassment, hostile workplace environments on the ground of '
        + 'sex, and victimisation are prohibited. This applies to everybody in the workplace, '
        + 'including contractors, volunteers and visitors, and it applies at work-related events as '
        + 'much as at the workplace.',
        'The employer has a positive duty to take reasonable and proportionate measures to eliminate '
        + 'this conduct as far as possible. That is a duty to prevent, not only to respond: it is not '
        + 'discharged by having a complaints process and waiting for it to be used.',
        'A report may be made to any manager, or directly to whoever holds the people records. It '
        + 'will be handled promptly, confidentially so far as that is possible, and without '
        + 'detriment to the person reporting. Victimising somebody for making a report is itself a '
        + 'breach of this policy and of the Act.',
        'The Australian Human Rights Commission has had powers to enforce the positive duty since '
        + 'December 2023, and assesses what the employer actually did rather than what it wrote down.',
      ],
    }],
    footer: PLAIN,
  },
  'Work health and safety, including psychosocial hazards': {
    title: 'Work health and safety',
    subtitle: 'Including psychosocial hazards',
    sections: [{
      paragraphs: [
        'The employer must ensure, so far as is reasonably practicable, the health and safety of '
        + 'workers. Health means psychological health as well as physical health.',
        'Psychosocial hazards are to be identified, assessed and controlled like any other hazard. '
        + 'They include unreasonable job demands, low job control, poor support, low role clarity, '
        + 'poor organisational change management, harassment including sexual harassment, bullying, '
        + 'conflict, and exposure to traumatic material.',
        'Controls are applied in order: eliminate the hazard where that is reasonably practicable, '
        + 'and otherwise minimise it. Providing training or resilience programs is not a substitute '
        + 'for changing the work that is causing the harm.',
        'Workers must be consulted on matters that affect their health and safety, and may raise a '
        + 'concern without detriment. Incidents and near misses are recorded.',
      ],
    }],
    footer: PLAIN,
  },
  'Discrimination, bullying and equal opportunity': {
    title: 'Discrimination, bullying and equal opportunity',
    sections: [{
      paragraphs: [
        'Decisions about hiring, pay, hours, training, promotion and ending employment are made on '
        + 'the basis of the work. They are not made on the basis of race, colour, sex, sexual '
        + 'orientation, gender identity, intersex status, age, physical or mental disability, marital '
        + 'status, family or carer responsibilities, pregnancy, religion, political opinion, national '
        + 'extraction or social origin.',
        'Adverse action taken because somebody has a workplace right, or has exercised one, is '
        + 'prohibited under Part 3-1 of the Fair Work Act. Asking about pay, making a complaint, or '
        + 'taking leave they are entitled to are all workplace rights.',
        'Repeated unreasonable behaviour directed at a worker that creates a risk to health and '
        + 'safety is bullying. Reasonable management action carried out reasonably is not bullying, '
        + 'and neither is a single instance of unreasonable behaviour - though both may be dealt with '
        + 'under other policies.',
        'This policy is read together with the harassment and work health and safety policies. They '
        + 'describe one system, not three separate ones.',
      ],
    }],
    footer: PLAIN,
  },
  'Privacy and personal information': {
    title: 'Privacy and personal information',
    subtitle: 'Privacy Act 1988, Australian Privacy Principle 1',
    sections: [{
      paragraphs: [
        'Personal information is collected only where it is reasonably necessary, and people are told '
        + 'what is collected, why, and who it may be given to.',
        'Employee records held by a private sector employer are currently exempt from the Australian '
        + 'Privacy Principles where the act or practice is directly related to the employment '
        + 'relationship. That exemption is under review and is not relied on here: records are kept '
        + 'as though it did not exist.',
        'Personal documents are visible to the person they are about. Whenever somebody else opens '
        + 'one, that is recorded and the subject can see it. Emergency contact details are visible '
        + 'only to the person and to whoever keeps the people records.',
        'Records are kept for seven years as the Fair Work Regulations require, and are not kept '
        + 'beyond the period that requires them.',
        'A suspected data breach is assessed within thirty days. Where the assessment finds an '
        + 'eligible data breach, the Office of the Australian Information Commissioner and the people '
        + 'affected are notified as soon as practicable.',
      ],
    }],
    footer: PLAIN,
  },
  'Whistleblower protections': {
    title: 'Whistleblower protections',
    subtitle: 'Corporations Act 2001, section 1317AI',
    sections: [{
      paragraphs: [
        'A disclosure qualifies for protection where an eligible discloser has reasonable grounds to '
        + 'suspect misconduct, or an improper state of affairs, and makes it to an eligible recipient.',
        'Eligible disclosers include current and former employees, officers, contractors and their '
        + 'employees, and relatives of any of those. A disclosure may be made anonymously and the '
        + 'protection is not lost by doing so.',
        'The identity of a discloser must not be revealed without their consent, except to the '
        + 'regulator or to a lawyer for the purpose of obtaining advice. Causing or threatening '
        + 'detriment to somebody because of a disclosure is an offence.',
        'This policy is required of public companies, large proprietary companies and corporate '
        + 'trustees of registrable superannuation entities. Smaller employers are encouraged to have '
        + 'one and are not obliged to.',
      ],
    }],
    footer: PLAIN,
  },
  'Workplace surveillance': {
    title: 'Workplace surveillance',
    sections: [{
      paragraphs: [
        'Where camera, computer or tracking surveillance is carried out, workers are given written '
        + 'notice before it begins. The notice says what kind of surveillance, how it is carried out, '
        + 'when it starts, whether it is continuous or intermittent, and whether it is ongoing or for '
        + 'a set period.',
        'Requirements differ by state. New South Wales, the Australian Capital Territory and Victoria '
        + 'each have their own regime, and covert surveillance generally requires a magistrate.',
        'Surveillance is not carried out in change rooms, toilets or washrooms under any circumstances.',
        'Information gathered through surveillance is personal information and is handled under the '
        + 'privacy policy.',
      ],
    }],
    footer: PLAIN,
  },
};

export function policyDocument(requirement: string): PdfInput | null {
  return POLICIES[requirement] ?? null;
}

/** A handbook, for the shared document every workspace has. */
export function handbook(organisation: string): PdfInput {
  return {
    title: 'Team handbook',
    subtitle: organisation,
    sections: [
      {
        heading: 'Working here',
        paragraphs: [
          'Core hours are 10:00 to 16:00. Outside those, arrange your day with your manager. '
          + 'Flexibility is expected to work in both directions.',
          'You may refuse to monitor or respond to contact outside your working hours where that '
          + 'refusal is reasonable. See the right to disconnect policy.',
        ],
      },
      {
        heading: 'Leave',
        paragraphs: [
          'Request leave in the workspace at least two weeks ahead where you can. Your manager sees '
          + 'the request as soon as you submit it. Entitlements come from the National Employment '
          + 'Standards and cannot be reduced by anything in this handbook.',
        ],
      },
      {
        heading: 'Documents we ask you for',
        paragraphs: [
          'Some documents are required before your first day and others are renewed on a schedule. '
          + 'You will see whatever is outstanding on your own dashboard, and you will be reminded '
          + 'before anything expires rather than after.',
          'When a policy is re-issued, your earlier confirmation no longer stands and you will be '
          + 'asked to read the new version. That is deliberate: a record saying everybody has read a '
          + 'document is only worth anything if it means the document they actually have.',
        ],
      },
      {
        heading: 'Your record',
        paragraphs: [
          'Your personal documents are visible to you and to the people who keep staff records. '
          + 'Whenever somebody else opens one, that is recorded and you can see it on your profile.',
          'You are paid on the cycle set out in your agreement, and a pay slip is issued within one '
          + 'working day of each payment. Every pay slip you have been issued is on your pay page.',
        ],
      },
    ],
    footer: PLAIN,
  };
}

/** Anything else: a real document that says what it is. */
export function generic(name: string, description: string | null, category: string): PdfInput {
  return {
    title: name,
    subtitle: category,
    sections: [{
      paragraphs: [
        description || 'No description was recorded for this document.',
        'This document is stored in the workspace, is subject to the same seven-year retention as '
        + 'every other employment record, and any read of it by somebody other than its owner is '
        + 'recorded.',
      ],
    }],
    footer: PLAIN,
  };
}

/**
 * A pay slip, as a document description.
 *
 * Here rather than in the payroll service so that anything able to render a
 * `PdfInput` can produce one without pulling in the rest of payroll — the
 * seeding script does exactly that.
 */
export function paySlip(record: {
  employee_name: string;
  starts_on: string; ends_on: string; paid_on: string | null;
  gross_cents: number; tax_withheld_cents: number; net_cents: number;
  super_cents: number; super_fund: string | null; super_paid_on: string | null;
  ordinary_hours: number | null; overtime_hours: number | null;
  allowances?: { name: string; cents: number; detail?: string }[];
  deductions?: { name: string; cents: number; detail?: string }[];
}, money: (cents: number) => string): PdfInput {
  const lines = (list: { name: string; cents: number; detail?: string }[] = []): [string, string][] =>
    list.map((l) => [l.detail ? `${l.name} - ${l.detail}` : l.name, money(l.cents)]);

  return {
    title: 'Pay slip',
    subtitle: `${record.employee_name} · ${record.starts_on} to ${record.ends_on}`,
    sections: [
      {
        heading: 'Payment',
        rows: [
          ['Paid on', record.paid_on ?? 'Not yet paid'],
          ['Gross', money(record.gross_cents)],
          ['Tax withheld', money(record.tax_withheld_cents)],
          ...lines(record.allowances),
          ...lines(record.deductions),
          ['Net', money(record.net_cents)],
        ],
      },
      {
        heading: 'Superannuation',
        rows: [
          ['Contribution', money(record.super_cents)],
          ['Fund', record.super_fund ?? 'Not recorded'],
          ['Paid to the fund', record.super_paid_on ?? 'Not yet'],
        ],
      },
      ...(record.ordinary_hours !== null && record.ordinary_hours !== undefined ? [{
        heading: 'Hours',
        rows: [
          ['Ordinary', String(record.ordinary_hours)],
          ['Overtime', String(record.overtime_hours ?? 0)],
        ] as [string, string][],
      }] : []),
    ],
    footer:
      'Issued under regulation 3.46 of the Fair Work Regulations 2009, which requires a pay slip '
      + 'within one working day of payment. Keep this: employee records are retained for seven '
      + 'years, and you can ask your employer for a copy at any time.',
  };
}

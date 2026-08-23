import Link from 'next/link';
import { onboardingService } from '@snoopy/shared';
import { Icon } from '@/components/Icon';
import { ActionButton } from '@/components/Interactive';
import { EmptyState, PageHead, TableCard } from '@/components/ui';
import { deleteTemplateAction, duplicateTemplateAction } from '@/lib/actions';
import { requireAdmin } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  await requireAdmin();
  const db = await getServerSupabase();
  const templates = await onboardingService.listTemplates(db);

  return (
    <>
      <PageHead
        title="Onboarding templates"
        subtitle="A template is the recipe. Starting a plan copies its steps, so editing a template never rewrites someone's history."
        actions={
          <Link className="btn btn-primary" href="/onboarding/templates/new">
            <Icon name="plus" size={16} /> New template
          </Link>
        }
      />

      <TableCard>
        <table className="table">
          <thead><tr><th>Template</th><th className="num">Steps</th><th>Step types</th><th /></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link className="link" href={`/onboarding/templates/${t.id}`}>{t.name}</Link>
                  {t.description ? <div className="subtle truncate" style={{ maxWidth: 360 }}>{t.description}</div> : null}
                </td>
                <td className="num">{t.steps?.length ?? 0}</td>
                <td className="subtle">{[...new Set((t.steps ?? []).map((s) => s.type))].join(', ') || '—'}</td>
                <td className="actions">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <ActionButton label="Duplicate" action={duplicateTemplateAction.bind(null, t.id)} />
                    <ActionButton
                      label="Delete" icon="trash" variant="danger"
                      confirm="Delete this template? Plans already started keep their steps."
                      action={deleteTemplateAction.bind(null, t.id)}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr><td colSpan={4}><EmptyState title="No templates yet" message="Build a template once, then reuse it for every new starter." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

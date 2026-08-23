import { notFound } from 'next/navigation';
import { onboardingService } from '@snoopy/shared';
import { TemplateEditor } from '@/components/TemplateEditor';
import { PageHead } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCapability('onboarding.template.manage');
  const db = await getServerSupabase();
  const template = await onboardingService.getTemplate(db, id);
  if (!template) notFound();

  return (
    <>
      <PageHead title={template.name} subtitle="Editing a template affects future plans only." />
      <section className="card"><div className="card-body"><TemplateEditor template={template} /></div></section>
    </>
  );
}

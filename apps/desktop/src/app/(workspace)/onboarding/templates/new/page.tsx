import { TemplateEditor } from '@/components/TemplateEditor';
import { PageHead } from '@/components/ui';
import { requireAdmin } from '@/lib/session';

export default async function NewTemplatePage() {
  await requireAdmin();
  return (
    <>
      <PageHead title="New template" subtitle="Give it a name, then lay out the steps a new starter works through." />
      <section className="card"><div className="card-body"><TemplateEditor /></div></section>
    </>
  );
}

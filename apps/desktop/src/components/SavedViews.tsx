'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { SavedView } from '@snoopy/shared';
import { deleteSavedViewAction, saveViewAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

/**
 * Named filters, sitting beside the filters they name.
 *
 * A manager who wants "my team, overdue only" was rebuilding it from three
 * dropdowns every morning. The filters were always shareable — they live in the
 * URL — but a link you have to keep somewhere is a link you stop keeping.
 *
 * Saving is deliberately dull: it stores the query string the page is already
 * showing. What you see is what gets saved, which is the only rule that stays
 * true as reports gain filters.
 */
export function SavedViews({ views, ownerId }: { views: SavedView[]; ownerId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const { busy, error, call } = useAction();

  const query = params.toString();
  const current = views.find((v) => v.query === query);

  return (
    <div className="saved-views">
      {views.map((view) => {
        const active = view.query === query;
        return (
          <span key={view.id} className={`view-chip${active ? ' is-active' : ''}`}>
            <button
              className="view-chip-open"
              onClick={() => router.replace(view.query ? `${view.path}?${view.query}` : view.path)}
            >
              {view.name}
              {/* Somebody else's view, kept in this list because it answers a
                  question this team keeps asking. */}
              {view.owner_id !== ownerId ? <span className="subtle"> · shared</span> : null}
            </button>
            {view.owner_id === ownerId ? (
              <button
                className="view-chip-remove"
                aria-label={`Remove the saved view ${view.name}`}
                onClick={() => call(() => deleteSavedViewAction(view.id, view.path), undefined, {
                  confirmation: 'View removed.',
                })}
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </span>
        );
      })}

      {/* Nothing to save when nothing is filtered, and nothing to save twice. */}
      {query && !current ? (
        <button className="btn btn-sm btn-ghost" onClick={() => { setName(''); setNaming(true); }}>
          <Icon name="plus" size={14} /> Save this view
        </button>
      ) : null}

      {naming ? (
        <Overlay
          title="Save this view"
          onClose={() => setNaming(false)}
          footer={
            <>
              <button className="btn" onClick={() => setNaming(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !name.trim()}
                onClick={() => call(
                  () => saveViewAction({ name, path: pathname, query, isShared: shared }),
                  () => setNaming(false),
                  { confirmation: 'View saved.' },
                )}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <Field label="Name" hint="What question does this view answer?">
            <input
              className="input" value={name} autoFocus
              placeholder="My team, overdue only"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox" className="checkbox"
              checked={shared} onChange={(e) => setShared(e.target.checked)}
            />
            <span>Share with the workspace</span>
          </label>
          <p className="subtle" style={{ marginTop: 8 }}>
            A shared view only names a filter. Everyone who opens it still sees
            what they are allowed to see, and nothing else.
          </p>
        </Overlay>
      ) : null}
    </div>
  );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from './Icon';

/** Filters live in the URL so a filtered view can be shared or reloaded. */
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  return {
    pending,
    set(key: string, value: string) {
      const next = new URLSearchParams(params.toString());
      if (!value || value === 'All') next.delete(key);
      else next.set(key, value);
      start(() => router.replace(`${pathname}?${next.toString()}`));
    },
  };
}

export function SearchInput({ placeholder = 'Search…' }: { placeholder?: string }) {
  const params = useSearchParams();
  const { set } = useSetParam();
  const [value, setValue] = useState(params.get('q') ?? '');

  useEffect(() => {
    const t = setTimeout(() => { if (value !== (params.get('q') ?? '')) set('q', value); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="row" style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, display: 'flex', color: 'var(--ink-subtle)' }}>
        <Icon name="search" size={16} />
      </span>
      <input
        className="input search" style={{ paddingLeft: 32 }} type="search"
        placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)}
        aria-label={placeholder}
      />
    </label>
  );
}

export function SelectFilter({
  name, label, options, allLabel = 'All',
}: { name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const params = useSearchParams();
  const { set } = useSetParam();
  return (
    <select
      className="select" aria-label={label}
      value={params.get(name) ?? 'All'}
      onChange={(e) => set(name, e.target.value)}
    >
      <option value="All">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ClearFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if ([...params.keys()].length === 0) return null;
  return (
    <button className="btn btn-sm btn-ghost" onClick={() => router.replace(pathname)}>
      Clear filters
    </button>
  );
}

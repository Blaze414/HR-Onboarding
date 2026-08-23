'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';

export interface NavGroup {
  group: string;
  items: { href: string; label: string; icon: IconName }[];
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {groups.map((group) => (
        <div key={group.group}>
          <div className="nav-group-label">{group.group}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-item"
              aria-current={
                pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'page' : undefined
              }
            >
              <Icon name={item.icon} size={17} />
              <span className="label">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Breadcrumb({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const found = groups
    .flatMap((g) => g.items)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return (
    <div className="breadcrumbs">
      <Link href="/dashboard">Workspace</Link>
      <span aria-hidden>/</span>
      <span style={{ color: 'var(--ink)' }}>{found?.label ?? 'Dashboard'}</span>
    </div>
  );
}

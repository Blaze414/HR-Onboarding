/**
 * One drawn icon set, one stroke weight. Every glyph is authored here rather
 * than borrowed from a font or an emoji so the vocabulary stays consistent
 * across the whole workspace.
 */
export type IconName =
  | 'dashboard' | 'course' | 'task' | 'event' | 'document' | 'onboarding'
  | 'employees' | 'departments' | 'analytics' | 'reports' | 'activity'
  | 'profile' | 'settings' | 'plus' | 'search' | 'check' | 'close'
  | 'download' | 'upload' | 'trash' | 'edit' | 'drag' | 'chevronRight'
  | 'alert' | 'archive' | 'filter' | 'sun' | 'moon' | 'contrast' | 'bell';

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7.5" height="8.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.5" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.5" /><rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" /></>,
  course: <><path d="M3 6.2a2 2 0 0 1 2-2h5a2.5 2.5 0 0 1 2 1.2 2.5 2.5 0 0 1 2-1.2h5a2 2 0 0 1 2 2v11a1 1 0 0 1-1 1h-5.4a2.2 2.2 0 0 0-1.8.9 2.2 2.2 0 0 0-1.8-.9H4a1 1 0 0 1-1-1Z" /><path d="M12 5.4v13.7" /></>,
  task: <><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="m8.4 11.6 2.3 2.3 4.6-4.6" /></>,
  event: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.8h17M8.5 3v4M15.5 3v4" /></>,
  document: <><path d="M6 3.5h7.6L19 9v11.5H6z" /><path d="M13.4 3.5V9H19" /><path d="M9 13h6M9 16.5h4" /></>,
  onboarding: <><path d="M12 20.5V7" /><path d="m7 12 5-5 5 5" /><path d="M4 3.5h16" /></>,
  employees: <><circle cx="9" cy="8.5" r="3.5" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.6a3.4 3.4 0 0 1 0 6.5M18 20c0-2.3-.7-4-2-5.1" /></>,
  departments: <><rect x="9" y="3" width="6" height="5.5" rx="1.2" /><rect x="3" y="15.5" width="6" height="5.5" rx="1.2" /><rect x="15" y="15.5" width="6" height="5.5" rx="1.2" /><path d="M12 8.5v3.6M6 15.5v-3.4h12v3.4" /></>,
  analytics: <><path d="M4 20V10.5M10 20V4.5M16 20v-7M22 20H2" /></>,
  reports: <><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  activity: <><path d="M3 12h4l2.5-6.5 4 13L16.5 12H21" /></>,
  bell: <><path d="M18 8.5a6 6 0 0 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" /><path d="M13.7 19.5a2 2 0 0 1-3.4 0" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  download: <><path d="M12 3.5v12M7.5 11l4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  upload: <><path d="M12 20V8M7.5 12.5 12 8l4.5 4.5" /><path d="M4.5 4.5h15" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4h5v2.5" /><path d="M6.5 6.5 7.5 21h9l1-14.5" /><path d="M10.5 10.5v6.5M13.5 10.5v6.5" /></>,
  edit: <><path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17Z" /><path d="m14.5 6.5 3 3" /></>,
  drag: <><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="2.6" strokeLinecap="round" /></>,
  chevronRight: <><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></>,
  alert: <><path d="M12 4 2.8 20h18.4Z" /><path d="M12 10v4.2M12 17.4h.01" /></>,
  archive: <><rect x="3" y="4" width="18" height="4.5" rx="1.4" /><path d="M5 8.5V20h14V8.5" /><path d="M10 12.5h4" /></>,
  filter: <><path d="M3.5 5.5h17l-6.5 7.5V20l-4-2v-5Z" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></>,
  moon: <><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" /></>,
  contrast: <><circle cx="12" cy="12" r="8.6" /><path d="M12 3.4v17.2a8.6 8.6 0 0 0 0-17.2Z" fill="currentColor" stroke="none" /></>,
};

export function Icon({
  name, size = 18, className, title,
}: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined} aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}

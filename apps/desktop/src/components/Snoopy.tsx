/**
 * Mascot marks are drawn locally as SVG — the app never depends on remote
 * image URLs, and nothing here is a copied asset.
 */
export function SnoopyMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Snoopy Workplace">
      <circle cx="32" cy="32" r="31" fill="#191818" />
      <ellipse cx="32" cy="30" rx="17" ry="15" fill="#ffffff" />
      <ellipse cx="32" cy="42" rx="10" ry="9" fill="#ffffff" />
      <ellipse cx="16" cy="30" rx="7" ry="11" fill="#191818" transform="rotate(-16 16 30)" />
      <circle cx="27" cy="28" r="2.4" fill="#191818" />
      <ellipse cx="32" cy="39" rx="4" ry="3.2" fill="#191818" />
      <path d="M32 42 v4" stroke="#191818" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function WoodstockMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Woodstock">
      <ellipse cx="24" cy="28" rx="12" ry="11" fill="#f2b705" />
      <circle cx="24" cy="15" r="8" fill="#f2b705" />
      <path d="M20 7 l3 -6 l2 6 M25 7 l4 -5 l1 6" stroke="#f2b705" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="21" cy="14" r="1.7" fill="#191818" />
      <path d="M30 16 l6 2 l-6 2 z" fill="#c8433c" />
    </svg>
  );
}

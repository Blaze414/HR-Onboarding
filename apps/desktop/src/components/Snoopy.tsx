/**
 * Own mascot, own art — a companion-pup mark generated for this brand, cropped
 * to a circular badge served from `/public/mascot-mark.png`. Not the SVG the
 * app used to draw locally, and not anyone else's character either.
 */
export function SnoopyMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not a remote/optimizable one
    <img
      src="/mascot-mark.png"
      width={size}
      height={size}
      alt="Snoopy Workplace"
      style={{ borderRadius: '50%', display: 'block' }}
    />
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

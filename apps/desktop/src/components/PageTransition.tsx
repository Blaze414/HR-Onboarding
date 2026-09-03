'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Wraps each route segment so a navigation reads as arriving rather than
 * appearing. `template.tsx` (unlike `layout.tsx`) remounts on every
 * navigation, which is what gives this a fresh animation each time instead
 * of running once and never again.
 *
 * Entrance only — an exit animation would need the outgoing page to stay
 * mounted alongside the incoming one, which the App Router doesn't support
 * without duplicating every route's data fetch. A fast, small entrance
 * (12px rise, 180ms) reads as a page change without that cost.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="page-transition"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

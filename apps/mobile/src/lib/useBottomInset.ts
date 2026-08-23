import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Space to leave under a bottom-anchored bar.
 *
 * Native devices report this properly through safe-area insets. Mobile browsers
 * are the hard case, and iOS browsers are the hardest: Brave and Safari lay the
 * page out at full screen height and draw their toolbar *over* the bottom of
 * it, while reporting `innerHeight`, `visualViewport.height`, `100svh`,
 * `100dvh` and `100lvh` as all identical. Measured on an iPhone: every one of
 * them says 674 while roughly 100px of that is behind the toolbar. There is no
 * API that admits the difference.
 *
 * Measured on an iPhone, though, the toolbar sits *below* the viewport rather
 * than over it: the shell ends exactly where the visible area does. So this
 * stays modest — safe-area insets, plus any real gap between the shell and the
 * visual viewport, which is what Android reports when its toolbar does overlay.
 */

export function useBottomInset(minimum = 8): number {
  const insets = useSafeAreaInsets();
  const [shortfall, setShortfall] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    const shell = document.getElementById('root');
    if (!viewport || !shell) return;

    // Where a browser is honest about the overlap — Android Chrome, for one —
    // this reports it, and returns zero where the shell already fits.
    const update = () => {
      const shellBottom = shell.getBoundingClientRect().bottom;
      const visibleBottom = viewport.height + viewport.offsetTop;
      setShortfall(Math.max(0, Math.round(shellBottom - visibleBottom)));
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (Platform.OS !== 'web') return insets.bottom;

  return Math.max(insets.bottom, shortfall) + minimum;
}

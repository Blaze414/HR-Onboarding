import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

export type IconName =
  | 'dashboard' | 'course' | 'task' | 'event' | 'document' | 'onboarding' | 'profile'
  | 'check' | 'plus' | 'chevron' | 'upload' | 'search' | 'bell';

/** Same drawn vocabulary as the desktop app, at one stroke weight. */
export function Icon({
  name, size = 22, color,
}: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  const stroke = color ?? colors.inkMuted;
  const common = { stroke, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'dashboard' ? (
        <>
          <Rect x="3" y="3" width="7.5" height="8.5" rx="1.5" {...common} />
          <Rect x="13.5" y="3" width="7.5" height="5" rx="1.5" {...common} />
          <Rect x="13.5" y="11" width="7.5" height="10" rx="1.5" {...common} />
          <Rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" {...common} />
        </>
      ) : null}
      {name === 'bell' ? (
        <>
          <Path d="M18 8.5a6 6 0 0 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" {...common} />
          <Path d="M13.7 19.5a2 2 0 0 1-3.4 0" {...common} />
        </>
      ) : null}
      {name === 'course' ? (
        <>
          <Path d="M3 6.2a2 2 0 0 1 2-2h5a2.5 2.5 0 0 1 2 1.2 2.5 2.5 0 0 1 2-1.2h5a2 2 0 0 1 2 2v11a1 1 0 0 1-1 1h-5.4a2.2 2.2 0 0 0-1.8.9 2.2 2.2 0 0 0-1.8-.9H4a1 1 0 0 1-1-1Z" {...common} />
          <Path d="M12 5.4v13.7" {...common} />
        </>
      ) : null}
      {name === 'task' ? (
        <>
          <Rect x="4" y="3.5" width="16" height="17" rx="2.5" {...common} />
          <Path d="m8.4 11.6 2.3 2.3 4.6-4.6" {...common} />
        </>
      ) : null}
      {name === 'event' ? (
        <>
          <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...common} />
          <Path d="M3.5 9.8h17M8.5 3v4M15.5 3v4" {...common} />
        </>
      ) : null}
      {name === 'document' ? (
        <>
          <Path d="M6 3.5h7.6L19 9v11.5H6z" {...common} />
          <Path d="M13.4 3.5V9H19M9 13h6M9 16.5h4" {...common} />
        </>
      ) : null}
      {name === 'onboarding' ? <Path d="M12 20.5V7m-5 5 5-5 5 5M4 3.5h16" {...common} /> : null}
      {name === 'profile' ? (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" {...common} />
        </>
      ) : null}
      {name === 'check' ? <Path d="m5 12.5 4.5 4.5L19 7.5" {...common} /> : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...common} /> : null}
      {name === 'chevron' ? <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" {...common} /> : null}
      {name === 'upload' ? <Path d="M12 20V8m-4.5 4.5L12 8l4.5 4.5M4.5 4.5h15" {...common} /> : null}
      {name === 'search' ? (
        <>
          <Circle cx="11" cy="11" r="6.5" {...common} />
          <Path d="m16 16 4.5 4.5" {...common} />
        </>
      ) : null}
    </Svg>
  );
}

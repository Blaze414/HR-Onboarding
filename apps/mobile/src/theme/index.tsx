import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

/**
 * The mobile app shares the desktop's world — warm cream ground, soft rounded
 * panels, one coral accent — in both light and dark, and sizes everything for
 * thumbs. Kept in sync with apps/desktop/src/app/globals.css's :root tokens
 * (converted from OKLCH to sRGB hex, since RN's style parser doesn't resolve
 * oklch()).
 */
const light = {
  bg: '#f8f5eb',
  surface: '#fefcf8',
  surfaceMuted: '#f2efe2',
  rail: '#e4dece',
  railStrong: '#cac0ac',
  ink: '#241b15',
  inkMuted: '#61554e',
  inkSubtle: '#8c8179',
  accent: '#d33b36',
  accentInk: '#a51e27',
  accentSoft: '#ffe0da',
  ok: '#26894c',
  okSoft: '#d4f1d8',
  warn: '#ac6900',
  warnSoft: '#f7e6c3',
  info: '#007bad',
  infoSoft: '#d6ecf9',
  onAccent: '#fcfcf9',
};

const dark: typeof light = {
  bg: '#18120f',
  surface: '#251e19',
  surfaceMuted: '#2f2721',
  rail: '#40362f',
  railStrong: '#5c5048',
  ink: '#f1eee7',
  inkMuted: '#b6b0a6',
  inkSubtle: '#867f76',
  accent: '#fd7562',
  accentInk: '#ffa48a',
  accentSoft: '#4d2620',
  ok: '#6cc581',
  okSoft: '#1a3520',
  warn: '#e3ad4b',
  warnSoft: '#432f07',
  info: '#6dbbe8',
  infoSoft: '#103243',
  onAccent: '#0f0a07',
};

export type Colors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

/** 44pt is the floor for anything tappable. */
export const TAP_TARGET = 44;

function typeScale(colors: Colors) {
  return {
    display: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.ink },
    title: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.2, color: colors.ink },
    heading: { fontSize: 16, fontWeight: '600' as const, color: colors.ink },
    body: { fontSize: 15, color: colors.ink },
    label: { fontSize: 13, fontWeight: '600' as const, color: colors.ink },
    meta: { fontSize: 13, color: colors.inkMuted },
    caption: { fontSize: 11.5, fontWeight: '700' as const, letterSpacing: 0.8, color: colors.inkSubtle },
    stat: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6, color: colors.ink },
  };
}

export type TypeScale = ReturnType<typeof typeScale>;
export type ThemeChoice = 'system' | 'light' | 'dark';

interface ThemeValue {
  colors: Colors;
  type: TypeScale;
  scheme: 'light' | 'dark';
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const STORAGE_KEY = 'snoopy-theme';

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') setChoiceState(stored);
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: 'light' | 'dark' = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;
    const colors = scheme === 'dark' ? dark : light;
    return {
      colors,
      type: typeScale(colors),
      scheme,
      choice,
      setChoice: (next) => { setChoiceState(next); AsyncStorage.setItem(STORAGE_KEY, next); },
    };
  }, [choice, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme used outside ThemeProvider');
  return value;
}

/** Builds a stylesheet from the active palette, rebuilt only when it changes. */
export function useStyles<T>(factory: (colors: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

export function toneFor(status: string | null | undefined, colors: Colors) {
  switch (status) {
    case 'Completed':
    case 'Going':
      return { bg: colors.okSoft, fg: colors.ok };
    case 'In Progress':
    case 'Maybe':
      return { bg: colors.infoSoft, fg: colors.info };
    case 'Overdue':
    case 'High':
      return { bg: colors.accentSoft, fg: colors.accentInk };
    case 'Medium':
      return { bg: colors.warnSoft, fg: colors.warn };
    default:
      return { bg: colors.surfaceMuted, fg: colors.inkMuted };
  }
}

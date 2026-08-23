import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

/**
 * The mobile app shares the desktop's world — newsprint ground, ink panels,
 * one spot red — in both light and dark, and sizes everything for thumbs.
 */
const light = {
  bg: '#f1eee6',
  surface: '#fffefb',
  surfaceMuted: '#f8f6ef',
  rail: '#e0dbcd',
  railStrong: '#c9c2ae',
  ink: '#16150f',
  inkMuted: '#5c584c',
  inkSubtle: '#857f70',
  accent: '#b23a2e',
  accentInk: '#8a2c22',
  accentSoft: '#f8e7e2',
  ok: '#3a6f4b',
  okSoft: '#e6efe6',
  warn: '#8a5a12',
  warnSoft: '#f8eeda',
  info: '#2c5679',
  infoSoft: '#e6eef4',
  onAccent: '#fffefb',
};

const dark: typeof light = {
  bg: '#14120e',
  surface: '#1c1a15',
  surfaceMuted: '#23201a',
  rail: '#322e26',
  railStrong: '#4a453a',
  ink: '#f3efe4',
  inkMuted: '#b3ac9c',
  inkSubtle: '#8b8474',
  accent: '#d9614f',
  accentInk: '#f0a396',
  accentSoft: '#3a231e',
  ok: '#7cbb8f',
  okSoft: '#1f2d23',
  warn: '#d9a45c',
  warnSoft: '#322616',
  info: '#85b2d8',
  infoSoft: '#1a2733',
  onAccent: '#16130f',
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

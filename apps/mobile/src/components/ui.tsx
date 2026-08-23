import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { initials } from '@snoopy/shared';
import { radius, spacing, TAP_TARGET, toneFor, useStyles, useTheme, type Colors } from '@/theme';

export function Card({
  children, style, onPress,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const styles = useStyles(makeStyles);
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const styles = useStyles(makeStyles);
  const { type } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text style={type.title}>{children}</Text>
      {action}
    </View>
  );
}

export function Badge({ label }: { label: string | null | undefined }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  if (!label) return null;
  const tone = toneFor(label, colors);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

export function Progress({ value }: { value: number | null | undefined }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const fill = pct >= 80 ? colors.ok : pct >= 50 ? colors.accent : colors.warn;
  return (
    <View style={styles.progressRow}>
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: fill }]} />
      </View>
      <Text style={styles.progressValue}>{value === null || value === undefined ? '—' : `${pct}%`}</Text>
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const styles = useStyles(makeStyles);
  const { type } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label.toUpperCase()}</Text>
      <Text style={type.stat}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function Button({
  label, onPress, variant = 'primary', disabled, busy, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && styles.buttonPressed,
        (disabled || busy) && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.ink} />
      ) : (
        <Text style={[styles.buttonLabel, isPrimary && styles.buttonLabelPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title?: string; message: string }) {
  const styles = useStyles(makeStyles);
  const { type } = useTheme();
  return (
    <View style={styles.empty}>
      {title ? <Text style={type.heading}>{title}</Text> : null}
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

/**
 * Notices arrive rather than appear.
 *
 * A message that pops into existence between two paragraphs reads as a layout
 * glitch: the eye registers the shift before the words. A short rise-and-fade
 * says something new has been added, and costs nothing on the native driver.
 *
 * Reduced motion keeps the fade and drops the movement — the confirmation still
 * has to be noticeable, or the interface stops answering.
 */
function useNoticeEntrance(visible: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (active) setReduceMotion(on); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; sub.remove(); };
  }, []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 200 : 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return {
    opacity: progress,
    transform: reduceMotion
      ? []
      : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };
}

export function ErrorNotice({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  const styles = useStyles(makeStyles);
  const entrance = useNoticeEntrance(Boolean(message));
  if (!message) return null;
  return (
    <Animated.View style={[styles.error, entrance]} accessibilityRole="alert">
      <Text style={[styles.errorText, { flex: 1 }]}>{message}</Text>
      {onDismiss ? <NoticeDismiss onPress={onDismiss} label={message} /> : null}
    </Animated.View>
  );
}

export function SuccessNotice({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  const styles = useStyles(makeStyles);
  const entrance = useNoticeEntrance(Boolean(message));
  if (!message) return null;
  return (
    <Animated.View style={[styles.success, entrance]} accessibilityLiveRegion="polite">
      <Text style={[styles.successText, { flex: 1 }]}>{message}</Text>
      {onDismiss ? <NoticeDismiss onPress={onDismiss} label={message} /> : null}
    </Animated.View>
  );
}

/** Getting a message out of the way, at a size a thumb can actually hit. */
function NoticeDismiss({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Dismiss: ${label}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.75, paddingHorizontal: 4 })}
    >
      <Text style={{ color: colors.inkMuted, fontSize: 16, lineHeight: 18 }}>×</Text>
    </Pressable>
  );
}

/** Shown where a workflow exists but is deliberately desktop-only. */
export function RestrictedNotice({ message }: { message: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.restricted}>
      <Text style={styles.restrictedText}>{message}</Text>
    </View>
  );
}

export function Skeleton({ height = 16, width }: { height?: number; width?: number | `${number}%` }) {
  const styles = useStyles(makeStyles);
  return <View style={[styles.skeleton, { height, width: width ?? '100%' }]} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width="60%" />
          <View style={{ height: spacing.sm }} />
          <Skeleton height={10} width="35%" />
        </View>
      ))}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(makeStyles);
  return <View style={[styles.row, style]}>{children}</View>;
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rail,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.railStrong },
  sectionTitle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md, marginTop: spacing.sm,
  },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressTrack: { flex: 1, height: 7, borderRadius: radius.pill, backgroundColor: colors.rail, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressValue: { fontSize: 13, color: colors.inkMuted, minWidth: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  stat: {
    flex: 1, minWidth: '46%', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.rail, padding: spacing.lg, gap: 6,
  },
  statHint: { fontSize: 12, color: colors.inkMuted },
  button: {
    minHeight: TAP_TARGET, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.railStrong, backgroundColor: colors.surface,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  buttonLabelPrimary: { color: colors.onAccent },
  avatar: { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accentInk, fontWeight: '800' },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyMessage: { fontSize: 14, color: colors.inkMuted, textAlign: 'center' },
  error: { backgroundColor: colors.accentSoft, padding: spacing.md, borderRadius: radius.sm },
  errorText: { color: colors.accentInk, fontSize: 14 },
  success: { backgroundColor: colors.okSoft, padding: spacing.md, borderRadius: radius.sm },
  successText: { color: colors.ok, fontSize: 14 },
  restricted: {
    backgroundColor: colors.surfaceMuted, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.rail,
  },
  restrictedText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  skeleton: { backgroundColor: colors.rail, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

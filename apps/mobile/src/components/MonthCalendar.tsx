import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkEvent } from '@snoopy/shared';
import { Icon } from './Icon';
import { radius, spacing, TAP_TARGET, useStyles, useTheme, type Colors } from '@/theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday-first grid covering the month, padded to whole weeks. */
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  // Drop a trailing week that belongs entirely to the following month.
  return days[35].getMonth() === cursor.getMonth() ? days : days.slice(0, 35);
}

/**
 * A month at a glance, sized for thumbs: every cell is a full tap target, and
 * the day you pick drives the list underneath rather than opening anything.
 * Days carrying events are ringed in ink, the way the desktop calendar marks
 * them, so the two clients read as one product.
 */
export function MonthCalendar({
  events, selected, onSelect,
}: { events: WorkEvent[]; selected: string; onSelect: (day: string) => void }) {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    const from = new Date(`${selected}T00:00:00`);
    return new Date(from.getFullYear(), from.getMonth(), 1);
  });

  const countByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = dayKey(new Date(event.start_time));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  const days = monthGrid(cursor);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shiftMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <View style={styles.flip}><Icon name="chevron" size={18} color={colors.inkMuted} /></View>
        </Pressable>

        <Pressable
          onPress={() => {
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
            onSelect(dayKey(today));
          }}
          style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${monthLabel}. Jump to today.`}
        >
          <Text style={type.title}>{monthLabel}</Text>
        </Pressable>

        <Pressable
          onPress={() => shiftMonth(1)}
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Icon name="chevron" size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const key = dayKey(day);
          const count = countByDay.get(key) ?? 0;
          const outside = day.getMonth() !== cursor.getMonth();
          const isToday = key === dayKey(today);
          const isSelected = key === selected;

          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${day.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${
                count === 0 ? 'no events' : `${count} event${count === 1 ? '' : 's'}`
              }`}
            >
              <View
                style={[
                  styles.date,
                  count > 0 && !isSelected && styles.dateHasEvents,
                  isToday && !isSelected && styles.dateToday,
                  isSelected && styles.dateSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dateText,
                    outside && styles.dateTextOutside,
                    isSelected && styles.dateTextSelected,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>

              <View style={styles.dots}>
                {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
                  <View
                    key={index}
                    style={[styles.dot, isSelected && styles.dotSelected, outside && styles.dotOutside]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rail,
    padding: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { minHeight: TAP_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  arrow: {
    width: TAP_TARGET, height: TAP_TARGET, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm,
  },
  flip: { transform: [{ rotate: '180deg' }] },
  pressed: { backgroundColor: colors.surfaceMuted },
  week: { flexDirection: 'row', marginTop: spacing.sm, marginBottom: 2 },
  weekday: {
    flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700',
    letterSpacing: 0.6, color: colors.inkSubtle,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    minHeight: TAP_TARGET + 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  date: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  dateHasEvents: { borderWidth: 1.5, borderColor: colors.accent },
  dateToday: { borderWidth: 1.5, borderColor: colors.inkSubtle },
  dateSelected: { backgroundColor: colors.accent },
  dateText: { fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  dateTextOutside: { color: colors.inkSubtle, opacity: 0.6 },
  dateTextSelected: { color: colors.onAccent, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  dotSelected: { backgroundColor: colors.accentInk },
  dotOutside: { backgroundColor: colors.inkSubtle },
});

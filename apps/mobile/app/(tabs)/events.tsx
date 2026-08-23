import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMPTY_STATES, eventService, formatDateTime, type WorkEvent } from '@snoopy/shared';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Badge, Card, EmptyState, ErrorNotice, ListSkeleton, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, radius, useStyles, useTheme, type Colors } from '@/theme';

const VIEWS = ['Calendar', 'Upcoming'] as const;
type EventsView = (typeof VIEWS)[number];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EventsScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [view, setView] = useState<EventsView>('Calendar');
  const [selected, setSelected] = useState(() => dayKey(new Date()));

  // The calendar needs past months too, so load the full range and filter here
  // rather than asking the server twice.
  const { data, loading, refreshing, error, refresh } = useLoad(
    () => eventService.listEvents(supabase, {}),
    [],
  );

  const events = useMemo(() => data ?? [], [data]);
  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.start_time) >= new Date()),
    [events],
  );
  const forSelectedDay = useMemo(
    () => events
      .filter((e) => dayKey(new Date(e.start_time)) === selected)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events, selected],
  );

  // Where a chosen day is empty, the soonest event is more useful than a full stop.
  const nextUp = upcoming[0] ?? null;
  const selectedDate = new Date(`${selected}T00:00:00`);
  const rows = view === 'Calendar' ? forSelectedDay : upcoming;

  const renderCard = ({ item }: { item: WorkEvent }) => {
    const mine = item.participants?.find((p) => p.user_id === profile?.id);
    return (
      <Card style={{ marginBottom: spacing.md }} onPress={() => router.push(`/events/${item.id}`)}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
          {mine?.response ? <Badge label={mine.response} /> : null}
        </Row>
        <Text style={styles.meta}>{formatDateTime(item.start_time)}</Text>
        <Text style={styles.meta}>{item.location ?? 'No location set'}</Text>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.md }}>
      <View style={styles.header}>
        <Text style={type.display}>Events</Text>
        <Row>
          {VIEWS.map((option) => (
            <Text
              key={option}
              onPress={() => setView(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: view === option }}
              style={[styles.chip, view === option && styles.chipActive]}
            >
              {option}
            </Text>
          ))}
        </Row>
      </View>

      <ErrorNotice message={error} />

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            view === 'Calendar' ? (
              <View style={{ marginBottom: spacing.lg }}>
                <MonthCalendar events={events} selected={selected} onSelect={setSelected} />
                <Text style={styles.dayHeading}>
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            view === 'Calendar' ? (
              <Card>
                <Text style={styles.emptyDay}>Nothing scheduled on this day.</Text>
                {nextUp ? (
                  <Text
                    style={styles.nextUp}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelected(dayKey(new Date(nextUp.start_time)));
                    }}
                  >
                    Next up: {nextUp.title} — {formatDateTime(nextUp.start_time)}
                  </Text>
                ) : null}
              </Card>
            ) : (
              <Card><EmptyState message={EMPTY_STATES.events} /></Card>
            )
          }
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  dayHeading: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.lg },
  emptyDay: { fontSize: 14, color: colors.inkMuted },
  nextUp: { fontSize: 13.5, color: colors.accentInk, fontWeight: '600', marginTop: spacing.md, lineHeight: 19 },
  meta: { fontSize: 13, color: colors.inkMuted, marginTop: 4 },
});

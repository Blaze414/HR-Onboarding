import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseService, dueLabel, dueState, EMPTY_STATES } from '@snoopy/shared';
import { Badge, Card, EmptyState, ErrorNotice, ListSkeleton, Progress, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

const FILTERS = ['All', 'In Progress', 'Completed', 'Pending'] as const;

export default function CoursesScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const { data, loading, refreshing, error, refresh } = useLoad(
    async () => (profile ? courseService.listMyAssignments(supabase, profile.id) : []),
    [profile?.id],
  );

  const rows = useMemo(() => (data ?? []).filter((a) => {
    const matchesSearch = (a.course?.title ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === 'All' || a.status === filter);
  }), [data, search, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.md }}>
      <View style={styles.header}>
        <Text style={type.display}>My courses</Text>
        <TextInput
          style={styles.search}
          placeholder="Search courses" placeholderTextColor={colors.inkSubtle}
          value={search} onChangeText={setSearch} accessibilityLabel="Search courses"
        />
        <Row style={{ flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <Text
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              style={[styles.chip, filter === f && styles.chipActive]}
            >
              {f}
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
          ListEmptyComponent={<Card><EmptyState message={EMPTY_STATES.courses} /></Card>}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push(`/courses/${item.course_id}`)}>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{item.course?.title}</Text>
                <Badge label={item.status} />
              </Row>
              {item.is_required ? (
                <Text style={[styles.due, dueTone(item, colors)]}>{dueLabel(item, dueState(item))}</Text>
              ) : item.course?.description ? (
                <Text style={styles.desc} numberOfLines={2}>{item.course.description}</Text>
              ) : null}
              <Progress value={item.progress} />
            </Card>
          )}
        />
      )}
    </View>
  );
}

/** Required training states its deadline in the colour that matches its urgency. */
function dueTone(assignment: Parameters<typeof dueState>[0], colors: Colors) {
  const state = dueState(assignment);
  if (state === 'overdue') return { color: colors.accent, fontWeight: '600' as const };
  if (state === 'due_soon') return { color: colors.warn, fontWeight: '600' as const };
  if (state === 'done') return { color: colors.ok };
  return { color: colors.inkMuted };
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  due: { fontSize: 12.5, marginBottom: spacing.sm },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.md },
  search: {
    minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.railStrong,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, fontSize: 15, color: colors.ink,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  desc: { fontSize: 13.5, color: colors.inkMuted, marginBottom: spacing.md },
});

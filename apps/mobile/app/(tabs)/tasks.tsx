import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMPTY_STATES, formatRelativeDay, isOverdue, taskService } from '@snoopy/shared';
import { Badge, Card, EmptyState, ErrorNotice, ListSkeleton, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

const FILTERS = ['Open', 'All', 'Completed'] as const;

export default function TasksScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Open');

  const { data, loading, refreshing, error, refresh } = useLoad(
    async () => (profile ? taskService.listTasks(supabase, { assignedTo: profile.id }) : []),
    [profile?.id],
  );

  const rows = useMemo(() => (data ?? []).filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'All' ? true : filter === 'Completed' ? t.status === 'Completed' : t.status !== 'Completed';
    return matchesSearch && matchesFilter;
  }), [data, search, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.md }}>
      <View style={styles.header}>
        <Text style={type.display}>My tasks</Text>
        <TextInput
          style={styles.search}
          placeholder="Search tasks" placeholderTextColor={colors.inkSubtle}
          value={search} onChangeText={setSearch} accessibilityLabel="Search tasks"
        />
        <Row>
          {FILTERS.map((f) => (
            <Text
              key={f} onPress={() => setFilter(f)} accessibilityRole="button"
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
          ListEmptyComponent={<Card><EmptyState message={EMPTY_STATES.tasks} /></Card>}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push(`/tasks/${item.id}`)}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
                <Badge label={item.priority} />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={[styles.meta, isOverdue(item.due_date, item.status) && styles.overdue]}>
                  {formatRelativeDay(item.due_date)}
                </Text>
                <Badge label={item.status} />
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
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
  meta: { fontSize: 13, color: colors.inkMuted },
  overdue: { color: colors.accentInk, fontWeight: '600' },
});

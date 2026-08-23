import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  analyticsService, can, loadWorklist, type WorklistItem,
} from '@snoopy/shared';
import {
  Badge, Card, EmptyState, ErrorNotice, ListSkeleton, RestrictedNotice, Row, SectionTitle, StatTile,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

/**
 * What is waiting on HR, at a glance, on a phone.
 *
 * Reading is not deciding. HR standing in a corridor should be able to answer
 * "is anything blocking somebody today?" without opening a laptop — and should
 * not be able to clear it from there, because accepting a certificate is a
 * deliberate act with a name and a timestamp against it.
 *
 * Every row here is therefore inert. The queue itself is scoped by the caller's
 * own session, so a manager sees their team and HR sees the workspace, and
 * neither of them picks a filter.
 */

const LABELS: Record<WorklistItem['kind'], string> = {
  credential: 'Certificates to check',
  document: 'Documents returned',
  expiring: 'Expiring or lapsed',
  verification: 'Completions to confirm',
  training: 'Required training overdue',
  acknowledgement: 'Acknowledgements outstanding',
};

/** Blocking kinds first — the ones that stop somebody being placed. */
const ORDER: WorklistItem['kind'][] = [
  'credential', 'document', 'expiring', 'verification', 'training', 'acknowledgement',
];

export default function OverviewScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  const allowed = profile
    ? can('analytics.view_summary', profile.role, PLATFORM, profile.role_profile?.permissions)
    : false;

  const { data, loading, refreshing, error, refresh } = useLoad(
    async () => {
      if (!profile || !allowed) return null;
      const [worklist, summary] = await Promise.all([
        loadWorklist(supabase),
        analyticsService.getOrganisationProgress(supabase),
      ]);
      return { worklist, summary };
    },
    [profile?.id, allowed],
  );

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
        <RestrictedNotice message="This overview is for the people who run the workplace." />
      </View>
    );
  }

  const items = data?.worklist.items ?? [];
  const counts = data?.worklist.counts;
  const blocking = items.filter((item) => item.blocking);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <ErrorNotice message={error} />
      </View>

      {loading || !data ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          // The blocking items are the whole point of looking. Everything else
          // is a count, because a phone cannot usefully list it and nobody can
          // act on it from here anyway.
          data={blocking.slice(0, 12)}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            <View>
              <View style={styles.tiles}>
                <StatTile
                  label="Blocking now"
                  value={blocking.length}
                  hint={blocking.length === 0 ? 'Nothing held up' : 'Stops somebody being placed'}
                />
                <StatTile label="Waiting in total" value={items.length} hint="Across six sources" />
                <StatTile
                  label="People"
                  value={data.summary?.employees ?? '—'}
                  hint={`${data.summary?.overall_progress ?? 0}% overall`}
                />
                <StatTile
                  label="Overdue tasks"
                  value={data.summary?.overdue_tasks ?? 0}
                  hint="Across the workplace"
                />
              </View>

              <SectionTitle>Waiting on you</SectionTitle>
              <Card style={{ marginBottom: spacing.lg }}>
                {ORDER.map((kind) => (
                  <Row key={kind} style={styles.countRow}>
                    <Text style={[type.body, { flex: 1 }]}>{LABELS[kind]}</Text>
                    <Text style={[styles.count, (counts?.[kind] ?? 0) > 0 && styles.countLive]}>
                      {counts?.[kind] ?? 0}
                    </Text>
                  </Row>
                ))}
              </Card>

              {blocking.length ? <SectionTitle>What is blocking somebody</SectionTitle> : null}
            </View>
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>{item.person}</Text>
                <Badge label={LABELS[item.kind]} />
              </Row>
              <Text style={styles.what} numberOfLines={2}>{item.what}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
              {item.age !== null && item.age > 0 ? (
                <Text style={styles.age}>
                  {item.age} {item.age === 1 ? 'day' : 'days'} waiting
                </Text>
              ) : null}
            </Card>
          )}
          ListEmptyComponent={
            <Card><EmptyState message="Nothing is blocking anybody. Snoopy approves." /></Card>
          }
          ListFooterComponent={
            <View style={{ marginTop: spacing.lg }}>
              <RestrictedNotice message="This is a read. Accepting a certificate, a returned document or a completion is done on the desktop, where it is recorded against your name." />
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, paddingTop: spacing.md },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  countRow: { justifyContent: 'space-between', paddingVertical: 7 },
  count: { fontSize: 15, fontWeight: '700', color: colors.inkSubtle },
  countLive: { color: colors.ink },
  what: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  detail: { marginTop: 2, fontSize: 13, color: colors.inkMuted, lineHeight: 18 },
  age: { marginTop: 6, fontSize: 12, fontWeight: '600', color: colors.warn },
});

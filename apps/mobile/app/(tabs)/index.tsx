import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  analyticsService, can, dashboardService, dueLabel, dueState, EMPTY_STATES, firstName,
  formatDateTime, formatRelativeDay, greeting, loadWorklist, notificationService,
} from '@snoopy/shared';
import { Icon } from '@/components/Icon';
import {
  Badge, Card, EmptyState, ErrorNotice, ListSkeleton, Progress, Row, SectionTitle, StatTile,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

export default function HomeScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const { data, loading, refreshing, error, refresh } = useLoad(async () => {
    if (!profile) return null;
    const personal = await dashboardService.loadEmployeeDashboard(supabase, profile.id);
    // Admins get a summary only — the full analytics workspace is desktop-first.
    const summary = can('analytics.view_summary', profile.role, PLATFORM, profile.role_profile?.permissions)
      ? await analyticsService.getOrganisationProgress(supabase)
      : null;
    const attention = summary
      ? analyticsService.deriveAttention(await analyticsService.listEmployeeProgress(supabase)).length
      : 0;
    // What is waiting on HR right now, which is the thing worth a glance. Only
    // loaded for the people who can see it — for everybody else it is six
    // queries returning their own empty rows.
    const worklist = summary ? await loadWorklist(supabase) : null;
    const unread = await notificationService.unreadCount(supabase, profile.id);
    return { personal, summary, attention, unread, worklist };
  }, [profile?.id]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <View style={styles.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.display}>{greeting()}, {firstName(profile?.name ?? '')}</Text>
          <Text style={styles.sub}>
            {isAdmin ? 'Your work, plus how the organisation is tracking.' : 'Here is where your work stands today.'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
          accessibilityRole="button"
          accessibilityLabel={data?.unread ? `Notifications, ${data.unread} unread` : 'Notifications'}
          hitSlop={8}
        >
          <Icon name="bell" size={21} color={colors.inkMuted} />
          {data?.unread ? (
            <View style={styles.bellDot}>
              <Text style={styles.bellCount}>{data.unread > 9 ? '9+' : data.unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ErrorNotice message={error} />

      {loading || !data ? (
        <View style={{ marginTop: spacing.lg }}><ListSkeleton rows={3} /></View>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile label="Courses" value={data.personal.totalCourses} hint={`${data.personal.completedCourses} completed`} />
            <StatTile label="Open tasks" value={data.personal.outstandingTasks} hint={`${data.personal.overdueTasks} overdue`} />
            <StatTile label="Events" value={data.personal.upcomingEvents.length} hint="Coming up" />
            <StatTile
              label="Onboarding"
              value={data.personal.onboarding ? `${data.personal.onboarding.progress}%` : '—'}
              hint={data.personal.onboarding?.status ?? 'No plan'}
            />
          </View>

          {data.worklist ? (
            <>
              <SectionTitle>Waiting on you</SectionTitle>
              <Card style={styles.spaced} onPress={() => router.push('/overview')}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[type.heading, { flex: 1 }]}>
                    {data.worklist.items.length === 0
                      ? 'Nothing waiting'
                      : `${data.worklist.items.length} waiting on you`}
                  </Text>
                  <Icon name="chevron" size={18} />
                </Row>
                <Text style={styles.meta}>
                  {data.worklist.items.filter((i) => i.blocking).length} blocking somebody ·{' '}
                  {data.worklist.counts.credential} certificates ·{' '}
                  {data.worklist.counts.document} documents ·{' '}
                  {data.worklist.counts.expiring} expiring
                </Text>
              </Card>
            </>
          ) : null}

          {data.summary ? (
            <>
              <SectionTitle>Organisation summary</SectionTitle>
              <Card>
                <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
                  <Text style={type.meta}>{data.summary.employees} employees</Text>
                  <Badge label={`${data.attention} need attention`} />
                </Row>
                <Metric label="Overall" value={data.summary.overall_progress} />
                <Metric label="Courses" value={data.summary.course_progress} />
                <Metric label="Tasks" value={data.summary.task_progress} />
                <Metric label="Onboarding" value={data.summary.onboarding_progress} />
                <Text style={styles.note}>
                  Full analytics, employee management and reporting are on the desktop workspace.
                </Text>
              </Card>
            </>
          ) : null}

          <SectionTitle>Today&apos;s tasks</SectionTitle>
          {data.personal.tasks.filter((t) => t.status !== 'Completed').slice(0, 4).map((t) => (
            <Card key={t.id} style={styles.spaced} onPress={() => router.push(`/tasks/${t.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>{t.title}</Text>
                <Badge label={t.priority} />
              </Row>
              <Text style={styles.meta}>{formatRelativeDay(t.due_date)}</Text>
            </Card>
          ))}
          {data.personal.tasks.filter((t) => t.status !== 'Completed').length === 0 ? (
            <Card><EmptyState message={EMPTY_STATES.tasks} /></Card>
          ) : null}

          <SectionTitle>Course progress</SectionTitle>
          {data.personal.assignments.slice(0, 4).map((a) => {
            const state = dueState(a);
            return (
              <Card key={a.id} style={styles.spaced} onPress={() => router.push(`/courses/${a.course_id}`)}>
                <Row style={{ justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>{a.course?.title}</Text>
                  {a.is_required ? <RequiredChip state={state} label={dueLabel(a, state)} /> : null}
                </Row>
                <View style={{ height: spacing.md }} />
                <Progress value={a.progress} />
              </Card>
            );
          })}
          {data.personal.assignments.length === 0 ? (
            <Card><EmptyState message={EMPTY_STATES.courses} /></Card>
          ) : null}

          <SectionTitle>Upcoming events</SectionTitle>
          {data.personal.upcomingEvents.slice(0, 3).map((e) => (
            <Card key={e.id} style={styles.spaced} onPress={() => router.push(`/events/${e.id}`)}>
              <Text style={type.heading} numberOfLines={1}>{e.title}</Text>
              <Text style={styles.meta}>{formatDateTime(e.start_time)} · {e.location ?? 'No location'}</Text>
            </Card>
          ))}
          {data.personal.upcomingEvents.length === 0 ? (
            <Card><EmptyState message={EMPTY_STATES.events} /></Card>
          ) : null}

          <View style={{ height: spacing.xl }} />
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Progress value={value} />
    </View>
  );
}

/**
 * The requirement and its deadline read as one chip: a learner glancing at the
 * card should learn "required, and late" without parsing two separate marks.
 */
function RequiredChip({ state, label }: { state: string; label: string }) {
  const { colors } = useTheme();
  const tone =
    state === 'overdue' ? { bg: colors.accentSoft, fg: colors.accent }
    : state === 'due_soon' ? { bg: colors.warnSoft, fg: colors.warn }
    : state === 'done' ? { bg: colors.okSoft, fg: colors.ok }
    : { bg: colors.infoSoft, fg: colors.info };
  return (
    <View style={{ backgroundColor: tone.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
      <Text style={{ color: tone.fg, fontSize: 11, fontWeight: '600' }}>{label || 'Required'}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: 2 },
  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bell: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  bellPressed: { backgroundColor: colors.surfaceMuted },
  bellDot: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, paddingHorizontal: 4,
    borderRadius: radius.pill, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  bellCount: { color: colors.onAccent, fontSize: 9.5, fontWeight: '700', lineHeight: 12 },
  sub: { fontSize: 14, color: colors.inkMuted, marginTop: 4, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  spaced: { marginBottom: spacing.md },
  meta: { fontSize: 13, color: colors.inkMuted, marginTop: 6 },
  metricLabel: { fontSize: 13, color: colors.inkMuted, marginBottom: 6 },
  note: { fontSize: 12.5, color: colors.inkSubtle, marginTop: spacing.sm, lineHeight: 18 },
});

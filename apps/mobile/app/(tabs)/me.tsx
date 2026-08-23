import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  analyticsService, can, DESKTOP_ONLY_MESSAGE, formatDate, teamService,
} from '@snoopy/shared';
import { Icon } from '@/components/Icon';
import {
  Avatar, Badge, Button, Card, ErrorNotice, ListSkeleton, Progress, RestrictedNotice, Row, SectionTitle,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, type ThemeChoice, useStyles, useTheme } from '@/theme';

export default function MeScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const { choice, setChoice } = useTheme();

  // Managing somebody is a relationship, not a role, so it is asked of the
  // database rather than read off the profile.
  const { data, loading, error } = useLoad(
    async () => {
      if (!profile) return null;
      const [progress, reports] = await Promise.all([
        analyticsService.getEmployeeProgress(supabase, profile.id),
        teamService.listReports(supabase, profile.id),
      ]);
      return { progress, reportCount: reports.length };
    },
    [profile?.id],
  );

  if (!profile) return null;
  const isAdmin = profile.role === 'admin';
  const managesSomebody = (data?.reportCount ?? 0) > 0
    && can('employee.view_team', profile.role, PLATFORM, profile.role_profile?.permissions);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Row style={{ marginBottom: spacing.lg }}>
        <Avatar name={profile.name} size={54} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{profile.name}</Text>
          <Text style={styles.meta}>{profile.job_title ?? 'Employee'}</Text>
        </View>
        <Badge label={profile.role_profile?.name ?? (isAdmin ? 'Admin' : 'Employee')} />
      </Row>

      <ErrorNotice message={error} />

      <SectionTitle>Shortcuts</SectionTitle>
      {can('analytics.view_summary', profile.role, PLATFORM, profile.role_profile?.permissions) ? (
        <Card style={styles.spaced} onPress={() => router.push('/overview')}>
          <Row>
            <Icon name="dashboard" />
            <Text style={[type.heading, { flex: 1 }]}>What needs you</Text>
            <Icon name="chevron" size={18} />
          </Row>
        </Card>
      ) : null}
      <Card style={styles.spaced} onPress={() => router.push('/documents')}>
        <Row>
          <Icon name="document" />
          <Text style={[type.heading, { flex: 1 }]}>Documents</Text>
          <Icon name="chevron" size={18} />
        </Row>
      </Card>
      <Card style={styles.spaced} onPress={() => router.push('/requests')}>
        <Row>
          <Icon name="upload" />
          <Text style={[type.heading, { flex: 1 }]}>Requested from you</Text>
          <Icon name="chevron" size={18} />
        </Row>
      </Card>
      {managesSomebody ? (
        <Card style={styles.spaced} onPress={() => router.push('/team')}>
          <Row>
            <Icon name="profile" />
            <Text style={[type.heading, { flex: 1 }]}>My team</Text>
            <Icon name="chevron" size={18} />
          </Row>
        </Card>
      ) : null}
      <Card style={styles.spaced} onPress={() => router.push('/credentials')}>
        <Row>
          <Icon name="check" />
          <Text style={[type.heading, { flex: 1 }]}>My certificates</Text>
          <Icon name="chevron" size={18} />
        </Row>
      </Card>
      <Card style={styles.spaced} onPress={() => router.push('/onboarding')}>
        <Row>
          <Icon name="onboarding" />
          <Text style={[type.heading, { flex: 1 }]}>My onboarding</Text>
          <Icon name="chevron" size={18} />
        </Row>
      </Card>

      <SectionTitle>My progress</SectionTitle>
      {loading ? <ListSkeleton rows={1} /> : (
        <Card>
          <Metric label="Courses" value={data?.progress?.course_progress ?? null} />
          <Metric label="Tasks" value={data?.progress?.task_progress ?? null} />
          <Metric label="Onboarding" value={data?.progress?.onboarding_progress ?? null} />
          <Metric label="Overall" value={data?.progress?.overall_progress ?? null} />
          <Text style={styles.formula}>
            Overall combines course progress (50%), task completion (25%) and onboarding (25%).
          </Text>
        </Card>
      )}

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Row>
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((option) => (
            <Text
              key={option}
              onPress={() => setChoice(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: choice === option }}
              style={[styles.chip, choice === option && styles.chipActive]}
            >
              {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
            </Text>
          ))}
        </Row>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <Detail label="Email" value={profile.email} />
        <Detail label="Role" value={profile.role_profile?.name ?? (isAdmin ? 'Administrator' : 'Employee')} />
        <Detail label="Department" value={profile.department?.name ?? '—'} />
        <Detail label="Manager" value={profile.manager?.name ?? '—'} />
        <Detail label="Start date" value={formatDate(profile.start_date)} />
        <Detail label="Phone" value={profile.phone ?? '—'} />
      </Card>

      {!can('organisation.settings', profile.role, PLATFORM, profile.role_profile?.permissions) && isAdmin ? (
        <>
          <SectionTitle>Workspace administration</SectionTitle>
          <RestrictedNotice message={DESKTOP_ONLY_MESSAGE} />
        </>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: spacing.xl }} />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Progress value={value} />
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  const { type } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[type.body, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{value}</Text>
    </Row>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  meta: { fontSize: 13.5, color: colors.inkMuted, marginTop: 2 },
  spaced: { marginBottom: spacing.md },
  metricLabel: { fontSize: 13, color: colors.inkMuted, marginBottom: 6 },
  formula: { fontSize: 12.5, color: colors.inkSubtle, lineHeight: 18, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
});

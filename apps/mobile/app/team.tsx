import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  can, formatRelativeDay, teamService, type CourseAssignment, type EmployeeProgress,
} from '@snoopy/shared';
import {
  Avatar, Card, EmptyState, ErrorNotice, ListSkeleton, Progress, RestrictedNotice, Row, SectionTitle,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

/**
 * A manager's team, read-only.
 *
 * "Is my team current?" is a corridor question. "This certificate is
 * acceptable" is not, so nothing here is actionable — the screen answers and
 * then stops. The rows are chosen by the reporting-line policies, not by this
 * file, so a manager who asks for somebody else's team gets an empty list.
 */
export default function TeamScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  const canView = profile
    ? can('employee.view_team', profile.role, PLATFORM, profile.role_profile?.permissions)
    : false;

  const { data, loading, refreshing, error, refresh } = useLoad(
    async () => {
      if (!profile || !canView) {
        return { progress: [] as EmployeeProgress[], training: [] as CourseAssignment[] };
      }
      const [progress, training] = await Promise.all([
        teamService.teamProgress(supabase, profile.id),
        teamService.teamRequiredTraining(supabase, profile.id),
      ]);
      return { progress, training };
    },
    [profile?.id, canView],
  );

  const progress = data?.progress ?? [];
  const training = data?.training ?? [];
  const overdueBy = new Map<string, number>();
  for (const row of progress) overdueBy.set(row.employee_id, row.overdue_tasks);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <ErrorNotice message={error} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          data={progress}
          keyExtractor={(item) => item.employee_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Card><EmptyState message="Nobody reports to you yet." /></Card>}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Row style={{ marginBottom: spacing.sm }}>
                <Avatar name={item.name} />
                <View style={{ flex: 1 }}>
                  <Text style={type.heading} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>{item.job_title ?? 'Employee'}</Text>
                </View>
              </Row>
              <Progress value={item.overall_progress} />
              <Text style={styles.meta}>
                {item.completed_courses}/{item.total_courses} courses
                {' · '}{item.completed_tasks}/{item.total_tasks} tasks
                {(overdueBy.get(item.employee_id) ?? 0) > 0
                  ? ` · ${overdueBy.get(item.employee_id)} overdue`
                  : ''}
              </Text>
            </Card>
          )}
          ListFooterComponent={
            <View style={{ marginTop: spacing.lg }}>
              {training.length ? (
                <>
                  <SectionTitle>Required training still open</SectionTitle>
                  {training.map((assignment) => (
                    <Card key={assignment.id} style={{ marginBottom: spacing.sm }}>
                      <Text style={type.heading} numberOfLines={2}>{assignment.course?.title ?? 'Course'}</Text>
                      <Text style={styles.meta}>
                        {assignment.user?.name ?? 'Someone'}
                        {assignment.due_date ? ` · due ${formatRelativeDay(assignment.due_date)}` : ''}
                      </Text>
                    </Card>
                  ))}
                </>
              ) : null}
              <View style={{ marginTop: spacing.lg }}>
                <RestrictedNotice message="Approving anything for your team — certificates, returned documents, training sign-off — is desktop work." />
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  meta: { marginTop: 4, fontSize: 13, color: colors.inkMuted },
});

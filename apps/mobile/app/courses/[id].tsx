import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  courseService, DESKTOP_ONLY_MESSAGE, EMPTY_STATES, formatDate, friendlyError,
  type CourseAssignment,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, Progress,
  RestrictedNotice, Row, SectionTitle, SuccessNotice,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

const STEPS = [0, 25, 50, 75, 100];

export default function CourseDetailScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<CourseAssignment | null>(null);

  const { data, loading, error } = useLoad(async () => {
    if (!profile || !id) return null;
    const [course, assignments] = await Promise.all([
      courseService.getCourse(supabase, id),
      courseService.listMyAssignments(supabase, profile.id),
    ]);
    const mine = assignments.find((a) => a.course_id === id) ?? null;
    setAssignment(mine);
    return { course, mine };
  }, [id, profile?.id]);

  async function setProgress(next: number) {
    if (!assignment || !profile) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const updated = await courseService.updateAssignmentProgress(supabase, assignment, next, profile.id);
      setAssignment(updated);
      setSaved(next === 100 ? EMPTY_STATES.onboardingComplete : 'Progress saved.');
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.content}><ListSkeleton rows={2} /></View>;
  if (error) return <View style={styles.content}><ErrorNotice message={error} /></View>;
  if (!data?.course) return <View style={styles.content}><EmptyState message="This course is no longer available." /></View>;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={type.display}>{data.course.title}</Text>
      {data.course.description ? <Text style={styles.desc}>{data.course.description}</Text> : null}

      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Badge label={data.course.status} />
          <Text style={styles.meta}>
            {formatDate(data.course.start_date)} → {formatDate(data.course.end_date)}
          </Text>
        </Row>
        {assignment ? <Progress value={assignment.progress} /> : null}
      </Card>

      {assignment ? (
        <>
          <SectionTitle>Update my progress</SectionTitle>
          <ErrorNotice message={saveError} />
          <SuccessNotice message={saved} />
          <Card>
            <Row style={{ flexWrap: 'wrap' }}>
              {STEPS.map((step) => (
                <Button
                  key={step}
                  label={`${step}%`}
                  variant={assignment.progress === step ? 'primary' : 'secondary'}
                  busy={saving && assignment.progress !== step ? false : undefined}
                  disabled={saving}
                  onPress={() => setProgress(step)}
                  style={{ flexGrow: 1, minWidth: 64 }}
                />
              ))}
            </Row>
            <Text style={styles.hint}>
              Marking a course 100% completes it and updates your dashboard immediately.
            </Text>
          </Card>
        </>
      ) : (
        <>
          <SectionTitle>Not assigned</SectionTitle>
          <Card><EmptyState message="This course is not assigned to you yet." /></Card>
        </>
      )}

      <SectionTitle>Managing this course</SectionTitle>
      <RestrictedNotice message={DESKTOP_ONLY_MESSAGE} />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  desc: { fontSize: 14.5, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 21 },
  meta: { fontSize: 13, color: colors.inkMuted },
  hint: { fontSize: 12.5, color: colors.inkSubtle, marginTop: spacing.md, lineHeight: 18 },
});

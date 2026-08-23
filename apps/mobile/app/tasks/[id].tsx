import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatDate, formatRelativeDay, friendlyError, taskService, type Task, type TaskStatus,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, Row, SectionTitle, SuccessNotice,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

const CHOICES: TaskStatus[] = ['Pending', 'In Progress', 'Completed'];

export default function TaskDetailScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { loading, error } = useLoad(async () => {
    if (!id) return null;
    const found = await taskService.getTask(supabase, id);
    setTask(found);
    return found;
  }, [id]);

  async function setStatus(status: TaskStatus) {
    if (!task || !profile) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const updated = await taskService.setTaskStatus(supabase, task, status, profile.id);
      setTask(updated);
      setSaved(status === 'Completed' ? 'Task completed. Snoopy approves.' : 'Status updated.');
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.content}><ListSkeleton rows={2} /></View>;
  if (error) return <View style={styles.content}><ErrorNotice message={error} /></View>;
  if (!task) return <View style={styles.content}><EmptyState message="This task is no longer available." /></View>;

  const isMine = task.assigned_to === profile?.id;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={type.display}>{task.title}</Text>
      {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}

      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Badge label={task.status} />
          <Badge label={task.priority} />
        </Row>
        <Detail label="Due" value={`${formatDate(task.due_date)} · ${formatRelativeDay(task.due_date)}`} />
        <Detail label="Course" value={task.course?.title ?? '—'} />
        <Detail label="Completed" value={task.completed_at ? formatDate(task.completed_at) : '—'} />
      </Card>

      <SectionTitle>Update status</SectionTitle>
      <ErrorNotice message={saveError} />
      <SuccessNotice message={saved} />

      {isMine ? (
        <Card>
          <Row style={{ flexWrap: 'wrap' }}>
            {CHOICES.map((choice) => (
              <Button
                key={choice}
                label={choice}
                variant={task.status === choice ? 'primary' : 'secondary'}
                disabled={saving}
                onPress={() => setStatus(choice)}
                style={{ flexGrow: 1, minWidth: 104 }}
              />
            ))}
          </Row>
        </Card>
      ) : (
        <Card>
          <EmptyState message="Only the person responsible for this task can change its status." />
        </Card>
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  const { type } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[type.body, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{value}</Text>
    </Row>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  desc: { fontSize: 14.5, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 21 },
  label: { fontSize: 13, color: colors.inkMuted },
});

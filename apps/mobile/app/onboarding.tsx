import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DESKTOP_ONLY_MESSAGE, EMPTY_STATES, formatDate, formatRelativeDay, friendlyError,
  onboardingService, type EmployeeOnboarding, type OnboardingStep,
} from '@snoopy/shared';
import { Icon } from '@/components/Icon';
import {
  Badge, Card, EmptyState, ErrorNotice, ListSkeleton, Progress, RestrictedNotice, Row,
  SectionTitle, SuccessNotice,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { TAP_TARGET, radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

export default function OnboardingScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  const [plan, setPlan] = useState<EmployeeOnboarding | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { loading, refreshing, error, refresh } = useLoad(async () => {
    if (!profile) return null;
    const found = await onboardingService.getMyOnboarding(supabase, profile.id);
    setPlan(found);
    return found;
  }, [profile?.id]);

  async function toggle(step: OnboardingStep) {
    if (!profile || !plan) return;
    setSavingId(step.id);
    setActionError(null);
    setNotice(null);
    try {
      if (step.status === 'Completed') await onboardingService.reopenStep(supabase, step.id);
      else await onboardingService.completeStep(supabase, step, profile.id);

      const updated = await onboardingService.getMyOnboarding(supabase, profile.id);
      setPlan(updated);
      if (updated?.progress === 100) setNotice(EMPTY_STATES.onboardingComplete);
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <View style={styles.content}><ListSkeleton rows={3} /></View>;

  if (!plan) {
    return (
      <View style={styles.content}>
        <ErrorNotice message={error} />
        <Card><EmptyState title="Nothing to complete" message="No onboarding plan is assigned to you right now." /></Card>
      </View>
    );
  }

  const done = (plan.steps ?? []).filter((s) => s.status === 'Completed').length;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <ErrorNotice message={error ?? actionError} />
      <SuccessNotice message={notice} />

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Text style={type.title}>{plan.progress}% complete</Text>
          <Badge label={plan.status} />
        </Row>
        <Progress value={plan.progress} />
        <Text style={styles.meta}>
          {done} of {plan.steps?.length ?? 0} steps · target {formatRelativeDay(plan.target_completion_date)}
        </Text>
        <Text style={styles.meta}>Started {formatDate(plan.start_date)}</Text>
      </Card>

      <SectionTitle>Steps</SectionTitle>
      {(plan.steps ?? []).map((step) => {
        const complete = step.status === 'Completed';
        return (
          <Pressable
            key={step.id}
            onPress={() => toggle(step)}
            disabled={savingId === step.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: complete, busy: savingId === step.id }}
            accessibilityLabel={`${step.title}, ${complete ? 'completed' : 'not completed'}`}
            style={({ pressed }) => [styles.step, complete && styles.stepDone, pressed && styles.stepPressed]}
          >
            <View style={[styles.box, complete && styles.boxChecked]}>
              {complete ? <Icon name="check" size={14} color={colors.onAccent} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.heading, complete && styles.doneText]}>{step.title}</Text>
              <Text style={styles.meta}>{step.type}{step.due_date ? ` · ${formatRelativeDay(step.due_date)}` : ''}</Text>
            </View>
          </Pressable>
        );
      })}

      <SectionTitle>Onboarding templates</SectionTitle>
      <RestrictedNotice message={DESKTOP_ONLY_MESSAGE} />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  meta: { fontSize: 13, color: colors.inkMuted, marginTop: 6 },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: TAP_TARGET + 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    borderRadius: radius.md, marginBottom: spacing.sm,
  },
  stepDone: { backgroundColor: colors.surfaceMuted },
  stepPressed: { borderColor: colors.railStrong },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.railStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  doneText: { color: colors.inkMuted, textDecorationLine: 'line-through' },
});

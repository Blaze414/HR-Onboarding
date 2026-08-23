import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DESKTOP_ONLY_MESSAGE, eventService, formatDateTime, friendlyError,
  type EventResponse, type WorkEvent,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, RestrictedNotice, Row,
  SectionTitle, SuccessNotice,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

const RESPONSES: EventResponse[] = ['Going', 'Maybe', 'Declined'];

export default function EventDetailScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [event, setEvent] = useState<WorkEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { loading, error } = useLoad(async () => {
    if (!id) return null;
    const found = await eventService.getEvent(supabase, id);
    setEvent(found);
    return found;
  }, [id]);

  async function respond(response: EventResponse) {
    if (!event || !profile) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      await eventService.respondToEvent(supabase, profile.organisation_id, event.id, profile.id, response);
      setEvent(await eventService.getEvent(supabase, event.id));
      setSaved(`You responded ${response.toLowerCase()}.`);
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.content}><ListSkeleton rows={2} /></View>;
  if (error) return <View style={styles.content}><ErrorNotice message={error} /></View>;
  if (!event) return <View style={styles.content}><EmptyState message="This event is no longer available." /></View>;

  const mine = event.participants?.find((p) => p.user_id === profile?.id);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={type.display}>{event.title}</Text>
      {event.description ? <Text style={styles.desc}>{event.description}</Text> : null}

      <Card style={{ marginTop: spacing.lg }}>
        <Detail label="Starts" value={formatDateTime(event.start_time)} />
        <Detail label="Ends" value={formatDateTime(event.end_time)} />
        <Detail label="Location" value={event.location ?? '—'} />
        <Detail label="Invited" value={String(event.participants?.length ?? 0)} />
      </Card>

      <SectionTitle>Your response</SectionTitle>
      <ErrorNotice message={saveError} />
      <SuccessNotice message={saved} />
      <Card>
        <Row style={{ flexWrap: 'wrap' }}>
          {RESPONSES.map((r) => (
            <Button
              key={r}
              label={r}
              variant={mine?.response === r ? 'primary' : 'secondary'}
              disabled={saving}
              onPress={() => respond(r)}
              style={{ flexGrow: 1, minWidth: 100 }}
            />
          ))}
        </Row>
      </Card>

      {(event.participants ?? []).length > 0 ? (
        <>
          <SectionTitle>Who is coming</SectionTitle>
          <Card>
            {(event.participants ?? []).map((p) => (
              <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
                <Text style={type.body}>{p.user?.name ?? 'Someone'}</Text>
                <Badge label={p.response ?? 'No response'} />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Managing this event</SectionTitle>
      <RestrictedNotice message={DESKTOP_ONLY_MESSAGE} />
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

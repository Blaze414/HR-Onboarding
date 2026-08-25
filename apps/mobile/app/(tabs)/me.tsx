import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  analyticsService, authService, can, DESKTOP_ONLY_MESSAGE, documentService, formatDate,
  formatDateTime, friendlyError, teamService,
} from '@snoopy/shared';
import { Icon } from '@/components/Icon';
import {
  Avatar, Badge, Button, Card, ErrorNotice, ListSkeleton, Progress, RestrictedNotice, Row, SectionTitle,
  SuccessNotice,
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
  const { profile, signOut, refreshProfile } = useAuth();

  // The person owns these, so they edit them here rather than emailing HR. The
  // database restores anything else an update touches.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  function openEditor() {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setContactName(data?.contact?.name ?? '');
    setContactRelationship(data?.contact?.relationship ?? '');
    setContactPhone(data?.contact?.phone ?? '');
    setSaveError(null);
    setSaved(null);
    setEditing(true);
  }

  async function save() {
    if (!profile) return;
    // A name with nobody to ring is not an emergency contact.
    if (contactName.trim() && !contactPhone.trim()) {
      setSaveError('Add a number for your emergency contact.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await authService.updateOwnDetails(supabase, profile.id, { phone });
      await authService.saveEmergencyContact(supabase, {
        userId: profile.id,
        organisationId: profile.organisation_id,
        name: contactName,
        relationship: contactRelationship,
        phone: contactPhone,
      });
      await refreshProfile();
      reload();
      setSaved('Saved. HR sees this straight away.');
      setEditing(false);
    } catch (thrown) {
      setSaveError(friendlyError(thrown));
    } finally {
      setSaving(false);
    }
  }
  const { choice, setChoice } = useTheme();

  // Managing somebody is a relationship, not a role, so it is asked of the
  // database rather than read off the profile.
  const { data, loading, error, reload } = useLoad(
    async () => {
      if (!profile) return null;
      const [progress, reports, contact, access, signIns] = await Promise.all([
        analyticsService.getEmployeeProgress(supabase, profile.id),
        teamService.listReports(supabase, profile.id),
        authService.loadEmergencyContact(supabase, profile.id),
        documentService.listDocumentAccess(supabase, profile.id, 5),
        authService.listSignIns(supabase, 5),
      ]);
      return { progress, reportCount: reports.length, contact, access, signIns };
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

      <SectionTitle>In an emergency</SectionTitle>
      <SuccessNotice message={saved} />
      <ErrorNotice message={saveError} />
      {editing ? (
        <Card>
          <Text style={styles.label}>Your phone</Text>
          <TextInput
            style={styles.input} value={phone} onChangeText={setPhone}
            keyboardType="phone-pad" placeholder="0400 000 000"
            placeholderTextColor={colors.inkSubtle} accessibilityLabel="Your phone"
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>Who should we call</Text>
          <TextInput
            style={styles.input} value={contactName} onChangeText={setContactName}
            placeholder="Their name" placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Emergency contact name"
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>Relationship</Text>
          <TextInput
            style={styles.input} value={contactRelationship} onChangeText={setContactRelationship}
            placeholder="Partner, parent, friend" placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Relationship"
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>Their number</Text>
          <TextInput
            style={styles.input} value={contactPhone} onChangeText={setContactPhone}
            keyboardType="phone-pad" placeholder="0400 000 000"
            placeholderTextColor={colors.inkSubtle} accessibilityLabel="Emergency contact number"
          />
          <Row style={{ marginTop: spacing.lg }}>
            <Button label="Save" onPress={save} busy={saving} style={{ flex: 1 }} />
            <Button
              label="Cancel" variant="ghost" style={{ flex: 1 }}
              onPress={() => { setEditing(false); setSaveError(null); }}
            />
          </Row>
        </Card>
      ) : (
        <Card>
          {data?.contact ? (
            <>
              <Detail label="Contact" value={data.contact.name} />
              <Detail label="Relationship" value={data.contact.relationship ?? '—'} />
              <Detail label="Their number" value={data.contact.phone} />
            </>
          ) : (
            <Text style={styles.meta}>
              Nobody recorded. If something happens at work, this is the number that gets rung.
              Only you and HR can see it.
            </Text>
          )}
          <Button
            label={data?.contact ? 'Update my details' : 'Add an emergency contact'}
            variant="secondary" onPress={openEditor} style={{ marginTop: spacing.md }}
          />
        </Card>
      )}

      <SectionTitle>Who opened my files</SectionTitle>
      <Card>
        {data?.access?.length ? (
          data.access.map((entry) => {
            const actor = Array.isArray(entry.actor) ? entry.actor[0] : entry.actor;
            return (
              <View key={entry.id} style={{ paddingVertical: 6 }}>
                <Text style={type.body} numberOfLines={1}>{entry.document_name}</Text>
                <Text style={styles.meta}>
                  {actor?.name ?? 'Somebody in HR'} · {formatDateTime(entry.opened_at)}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.meta}>
            Nobody has opened your personal documents. Opening your own files is not listed here.
          </Text>
        )}
      </Card>

      {/*
        * The phone signs in against the auth service directly, so this list is
        * not the web app's doing — the attempt is recorded by a hook inside the
        * auth service itself, which every client goes through. A sign in from a
        * device that is not yours is the one thing an app cannot prevent and
        * you can recognise instantly.
        */}
      <SectionTitle>Recent sign-ins</SectionTitle>
      <Card>
        {data?.signIns?.length ? (
          data.signIns.map((entry) => (
            <View key={entry.id} style={{ paddingVertical: 6 }}>
              <Text style={type.body} numberOfLines={1}>
                {authService.signInSummary(entry)}
              </Text>
              <Text style={entry.succeeded ? styles.meta : styles.metaWarn}>
                {entry.succeeded ? 'Signed in' : 'Failed attempt'} · {formatDateTime(entry.at)}
                {entry.time_zone ? ` · ${entry.time_zone}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>Nothing recorded yet.</Text>
        )}
        <Text style={[styles.meta, { marginTop: spacing.sm }]}>
          This is one history: sign in on the desktop and it appears here too. Five
          wrong passwords in fifteen minutes and the account stops answering, on
          either app.
        </Text>
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
  // A failed attempt is not an error to fix; it is a thing to look twice at.
  metaWarn: { fontSize: 13.5, color: colors.warn, marginTop: 2 },
  spaced: { marginBottom: spacing.md },
  metricLabel: { fontSize: 13, color: colors.inkMuted, marginBottom: 6 },
  formula: { fontSize: 12.5, color: colors.inkSubtle, lineHeight: 18, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkMuted, marginBottom: 6 },
  input: {
    minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.railStrong,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 15, color: colors.ink,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
});

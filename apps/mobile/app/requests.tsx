import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  can, documentRequestService, documentService, formatDate, formatRelativeDay, friendlyError,
  type DocumentRequest,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, RestrictedNotice, Row, SuccessNotice,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { spacing, type Colors, useStyles, useTheme } from '@/theme';

/**
 * The employee's half of the document-request loop.
 *
 * Returning a signed file is the step that holds everything else up, so it is
 * phone work. Deciding whether what came back is acceptable is not: reviewing
 * stays on the desktop, and this screen never offers it.
 */
export default function RequestsScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  const canSubmit = profile
    ? can('document.submit', profile.role, PLATFORM, profile.role_profile?.permissions)
    : false;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, refreshing, error, refresh, reload } = useLoad(
    async () => (profile ? documentRequestService.mine(supabase, profile.id) : []),
    [profile?.id],
  );

  const requests = data ?? [];
  // Accepted paperwork is history; what is still owed goes first.
  const outstanding = requests.filter((r) => r.status !== 'Accepted');
  const settled = requests.filter((r) => r.status === 'Accepted');

  async function open(storagePath: string) {
    setActionError(null);
    try {
      await Linking.openURL(await documentService.getDownloadUrl(supabase, storagePath, 120));
    } catch (e) {
      setActionError(friendlyError(e));
    }
  }

  async function submit(request: DocumentRequest) {
    if (!profile || !canSubmit) return;
    setActionError(null);
    setNotice(null);

    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setBusyId(request.id);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      await documentRequestService.submit(supabase, {
        requestId: request.id,
        organisationId: profile.organisation_id,
        employeeId: profile.id,
        file: blob,
        fileName: asset.name,
        contentType: asset.mimeType ?? 'application/octet-stream',
        title: request.title,
      });
      setNotice('Sent back. Somebody will review it.');
      reload();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  function renderRequest(request: DocumentRequest) {
    const returned = request.status === 'Returned';
    const overdue = request.status !== 'Accepted' && request.due_date
      ? new Date(request.due_date) < new Date()
      : false;

    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{request.title}</Text>
          <Badge label={request.status} />
        </Row>

        {request.due_date ? (
          <Text style={[styles.meta, overdue && styles.overdue]}>
            {formatRelativeDay(request.due_date)}
          </Text>
        ) : null}

        {request.instructions ? (
          <Text style={styles.instructions}>{request.instructions}</Text>
        ) : null}

        {returned && request.review_note ? (
          <Text style={styles.returnNote}>Sent back: {request.review_note}</Text>
        ) : null}

        {request.submitted ? (
          <Text style={styles.meta}>
            You returned {request.submitted.name} on {formatDate(request.submitted.created_at)}
          </Text>
        ) : null}

        <Row style={{ marginTop: spacing.md }}>
          {request.template ? (
            <Button
              label="Download the form" variant="secondary" style={{ flex: 1 }}
              onPress={() => open(request.template!.storage_path)}
            />
          ) : null}
          {canSubmit && request.status !== 'Accepted' ? (
            <Button
              label={returned ? 'Send it again' : request.submitted ? 'Replace it' : 'Return signed copy'}
              style={{ flex: 1 }}
              busy={busyId === request.id}
              onPress={() => submit(request)}
            />
          ) : null}
        </Row>
      </Card>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <ErrorNotice message={error ?? actionError} />
        <SuccessNotice message={notice} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          data={[...outstanding, ...settled]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Card><EmptyState message="Nothing has been asked of you. Snoopy approves." /></Card>}
          ListFooterComponent={
            <View style={{ marginTop: spacing.lg }}>
              <RestrictedNotice message="Asking somebody else for a document, or deciding whether what came back is acceptable, is desktop work." />
            </View>
          }
          renderItem={({ item }) => renderRequest(item)}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  meta: { fontSize: 13, color: colors.inkMuted },
  overdue: { color: colors.warn, fontWeight: '600' },
  instructions: { marginTop: spacing.sm, fontSize: 14, color: colors.ink, lineHeight: 20 },
  returnNote: { marginTop: spacing.sm, fontSize: 14, color: colors.warn, lineHeight: 20 },
});

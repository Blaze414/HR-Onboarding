import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  acknowledgementService, can, DESKTOP_ONLY_MESSAGE, DOCUMENT_CATEGORIES, documentService,
  EMPTY_STATES, formatDate, friendlyError,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, RestrictedNotice, Row, SuccessNotice,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

const SCOPES = ['all', 'mine', 'shared'] as const;
const SCOPE_LABEL: Record<(typeof SCOPES)[number], string> = {
  all: 'All', mine: 'Mine', shared: 'Shared',
};

export default function DocumentsScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  // Uploading a personal file is its own grant, separate from being able to
  // read the library.
  const canUpload = profile
    ? can('document.upload_personal', profile.role, PLATFORM, profile.role_profile?.permissions)
    : false;
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('all');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Details the uploader fills in. Without them every phone upload lands as an
  // untitled file in "General", which is what the desktop form already avoids.
  const [formOpen, setFormOpen] = useState(false);
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');

  const { data, loading, refreshing, error, refresh, reload } = useLoad(
    async () => {
      if (!profile) {
        return { documents: [], acknowledged: new Set<string>(), everRead: new Set<string>() };
      }
      const [documents, acknowledged, everRead] = await Promise.all([
        documentService.listDocuments(supabase, profile.id, { scope }),
        acknowledgementService.mine(supabase, profile.id),
        acknowledgementService.everRead(supabase, profile.id),
      ]);
      return { documents, acknowledged, everRead };
    },
    [profile?.id, scope],
  );

  const documents = data?.documents ?? [];
  const acknowledged = data?.acknowledged ?? new Set<string>();
  const everRead = data?.everRead ?? new Set<string>();

  /** Records that this person has read the document, then refreshes the list. */
  async function acknowledge(documentId: string) {
    if (!profile) return;
    setActionError(null);
    try {
      await acknowledgementService.acknowledge(supabase, documentId, profile.id, profile.organisation_id);
      setNotice('Acknowledgement recorded.');
      reload();
    } catch (thrown) {
      setActionError(friendlyError(thrown));
    }
  }

  function resetForm() {
    setAsset(null); setName(''); setCategory('General'); setDescription('');
  }

  async function pickFile() {
    setActionError(null);
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];
    setAsset(file);
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
  }

  /** Personal upload only — shared organisation files are managed on desktop. */
  async function upload() {
    if (!profile || !canUpload) return;
    if (!asset) { setActionError('Choose a file to upload.'); return; }
    if (!name.trim()) { setActionError('Give the document a name.'); return; }
    setActionError(null);
    setNotice(null);

    setBusy(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await documentService.uploadDocument(supabase, {
        organisationId: profile.organisation_id,
        ownerId: profile.id,
        actorId: profile.id,
        name: name.trim(),
        category,
        description: description.trim() || null,
        file: blob,
        fileName: asset.name,
        contentType: asset.mimeType ?? 'application/octet-stream',
      });
      setNotice('Uploaded. Snoopy approves.');
      setFormOpen(false);
      resetForm();
      reload();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function open(storagePath: string, documentId?: string) {
    setActionError(null);
    try {
      const url = await documentService.getDownloadUrl(supabase, storagePath, 120, documentId);
      await Linking.openURL(url);
    } catch (e) {
      setActionError(friendlyError(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Row>
          {SCOPES.map((s) => (
            <Text
              key={s} onPress={() => setScope(s)} accessibilityRole="button"
              style={[styles.chip, scope === s && styles.chipActive]}
            >
              {SCOPE_LABEL[s]}
            </Text>
          ))}
        </Row>
        {canUpload && !formOpen ? (
          <Button label="Upload a document" onPress={() => { setFormOpen(true); setNotice(null); }} />
        ) : null}

        {formOpen ? (
          <Card>
            <Text style={[type.heading, { marginBottom: spacing.md }]}>Upload a document</Text>

            <Text style={styles.label}>File</Text>
            <Button
              label={asset ? asset.name : 'Choose a file'}
              variant="secondary"
              onPress={pickFile}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Document name</Text>
            <TextInput
              style={styles.input}
              value={name} onChangeText={setName}
              placeholder="What is this document?" placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="Document name"
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Category</Text>
            <View style={styles.chipWrap}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <Text
                  key={c} onPress={() => setCategory(c)} accessibilityRole="button"
                  style={[styles.chip, category === c && styles.chipActive]}
                >
                  {c}
                </Text>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description} onChangeText={setDescription}
              multiline
              placeholder="Anything the reader should know" placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="Description"
            />

            <Row style={{ marginTop: spacing.lg }}>
              <Button label="Upload" onPress={upload} busy={busy} style={{ flex: 1 }} />
              <Button
                label="Cancel" variant="ghost" style={{ flex: 1 }}
                onPress={() => { setFormOpen(false); resetForm(); setActionError(null); }}
              />
            </Row>
          </Card>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <ErrorNotice message={error ?? actionError} />
        <SuccessNotice message={notice} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Card><EmptyState message={EMPTY_STATES.documents} /></Card>}
          ListFooterComponent={
            <View style={{ marginTop: spacing.lg }}>
              <RestrictedNotice message={`Organising shared documents for the whole workplace? ${DESKTOP_ONLY_MESSAGE}`} />
            </View>
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }} onPress={() => open(item.storage_path, item.id)}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{item.name}</Text>
                <Badge label={item.category} />
              </Row>
              <Text style={styles.meta}>
                {item.owner_id === null ? 'Shared with the organisation' : 'Personal'} · {formatDate(item.created_at)}
              </Text>

              {item.requires_acknowledgement ? (
                acknowledged.has(item.id) ? (
                  <Text style={styles.ackDone}>✓ You acknowledged this</Text>
                ) : (
                  <>
                    {/* Read an older version: say so, rather than pretending
                        they have never seen it. */}
                    {everRead.has(item.id) ? (
                      <Text style={styles.ackStale}>
                        Updated since you read it{item.version ? ` — now version ${item.version}` : ''}
                      </Text>
                    ) : null}
                    <Button
                      label={everRead.has(item.id) ? 'I have read the new version' : 'I have read this'}
                      variant="secondary"
                      onPress={() => acknowledge(item.id)}
                      style={{ marginTop: spacing.md }}
                    />
                  </>
                )
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkMuted, marginBottom: 6 },
  input: {
    minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.railStrong,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 15, color: colors.ink,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  ackDone: { marginTop: spacing.md, color: colors.ok, fontSize: 13, fontWeight: '600' },
  ackStale: { marginTop: spacing.md, color: colors.warn, fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  meta: { fontSize: 13, color: colors.inkMuted },
});

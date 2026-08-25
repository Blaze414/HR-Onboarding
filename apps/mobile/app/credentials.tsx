import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  can, credentialService, documentService, formatDate, friendlyError,
  type CredentialType, type EmployeeCredential,
} from '@snoopy/shared';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, ListSkeleton, RestrictedNotice, Row, SuccessNotice,
} from '@/components/ui';
import { PLATFORM, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

/** A date somebody typed. Anything else is rejected before it reaches the row. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What gets attached, from the camera or from the files app. */
type Attachment = { uri: string; name: string; mimeType: string };

/**
 * Offering a certificate from the phone, which is where the certificate is.
 *
 * Submitting is phone work; deciding whether it is acceptable is not. Nothing
 * on this screen sets a status — the record arrives Pending and stays there
 * until somebody with `credential.verify` says otherwise on the desktop.
 */
export default function CredentialsScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const { profile } = useAuth();
  const canSubmit = profile
    ? can('credential.submit', profile.role, PLATFORM, profile.role_profile?.permissions)
    : false;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [reference, setReference] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [asset, setAsset] = useState<Attachment | null>(null);

  const { data, loading, refreshing, error, refresh, reload } = useLoad(
    async () => {
      if (!profile) return { credentials: [] as EmployeeCredential[], types: [] as CredentialType[] };
      const [credentials, types] = await Promise.all([
        credentialService.mine(supabase, profile.id),
        credentialService.listTypes(supabase),
      ]);
      return { credentials, types };
    },
    [profile?.id],
  );

  const credentials = data?.credentials ?? [];
  const types = data?.types ?? [];
  const selectedType = types.find((t) => t.id === typeId) ?? null;

  function resetForm() {
    setTypeId(null); setTitle(''); setIssuer(''); setReference('');
    setIssuedOn(''); setExpiresOn(''); setAsset(null);
  }

  function attach(next: Attachment) {
    setAsset(next);
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, ''));
  }

  async function pickFile() {
    setActionError(null);
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];
    attach({
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType ?? 'application/octet-stream',
    });
  }

  /**
   * Photographs the certificate where it is, which is the whole point of doing
   * this on a phone. Permission is asked for at the moment it is needed, so
   * somebody who only ever attaches files is never prompted.
   */
  async function takePhoto() {
    setActionError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setActionError('Snoopy needs camera access to photograph a certificate. Attach a file instead, or allow the camera in your settings.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (shot.canceled || !shot.assets?.[0]) return;
    const image = shot.assets[0];
    attach({
      uri: image.uri,
      name: image.fileName ?? `certificate-${Date.now()}.jpg`,
      mimeType: image.mimeType ?? 'image/jpeg',
    });
  }

  async function submit() {
    if (!profile || !canSubmit) return;
    if (!title.trim()) { setActionError('Give the certificate a name.'); return; }
    for (const [label, value] of [['issue date', issuedOn], ['expiry date', expiresOn]] as const) {
      if (value.trim() && !ISO_DATE.test(value.trim())) {
        setActionError(`Write the ${label} as YYYY-MM-DD.`); return;
      }
    }
    // A certificate that expires is only useful if the record says when.
    if (selectedType?.requires_expiry && !expiresOn.trim()) {
      setActionError(`${selectedType.name} needs an expiry date.`); return;
    }

    setActionError(null);
    setNotice(null);
    setBusy(true);
    try {
      const blob = asset ? await (await fetch(asset.uri)).blob() : null;
      await credentialService.submit(supabase, {
        organisationId: profile.organisation_id,
        employeeId: profile.id,
        credentialTypeId: typeId,
        title: title.trim(),
        issuer: issuer.trim() || null,
        referenceNumber: reference.trim() || null,
        issuedOn: issuedOn.trim() || null,
        expiresOn: expiresOn.trim() || null,
        file: blob,
        fileName: asset?.name,
        contentType: asset?.mimeType,
      });
      setNotice('Sent. Somebody will check it.');
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
      await Linking.openURL(await documentService.getDownloadUrl(supabase, storagePath, 120, documentId));
    } catch (e) {
      setActionError(friendlyError(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        {canSubmit && !formOpen ? (
          <Button label="Add a certificate" onPress={() => { setFormOpen(true); setNotice(null); }} />
        ) : null}

        {formOpen ? (
          <Card>
            <Text style={[type.heading, { marginBottom: spacing.md }]}>Add a certificate</Text>

            {types.length ? (
              <>
                <Text style={styles.label}>What kind is it?</Text>
                <View style={styles.chipWrap}>
                  {types.map((t) => (
                    <Text
                      key={t.id} accessibilityRole="button"
                      onPress={() => setTypeId(typeId === t.id ? null : t.id)}
                      style={[styles.chip, typeId === t.id && styles.chipActive]}
                    >
                      {t.name}
                    </Text>
                  ))}
                </View>
                {selectedType?.verification_guidance ? (
                  <Text style={styles.guidance}>{selectedType.verification_guidance}</Text>
                ) : null}
              </>
            ) : null}

            <Text style={[styles.label, { marginTop: spacing.md }]}>Name on the certificate</Text>
            <TextInput
              style={styles.input} value={title} onChangeText={setTitle}
              placeholder="First Aid Certificate" placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="Name on the certificate"
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Who issued it</Text>
            <TextInput
              style={styles.input} value={issuer} onChangeText={setIssuer}
              placeholder="Optional" placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="Who issued it"
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Certificate number</Text>
            <TextInput
              style={styles.input} value={reference} onChangeText={setReference}
              placeholder="Optional, but it is what a checker re-checks"
              placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="Certificate number"
            />

            <Row style={{ marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Issued</Text>
                <TextInput
                  style={styles.input} value={issuedOn} onChangeText={setIssuedOn}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSubtle}
                  autoCapitalize="none" accessibilityLabel="Issue date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  Expires{selectedType?.requires_expiry ? '' : ' (optional)'}
                </Text>
                <TextInput
                  style={styles.input} value={expiresOn} onChangeText={setExpiresOn}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSubtle}
                  autoCapitalize="none" accessibilityLabel="Expiry date"
                />
              </View>
            </Row>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Photo or scan</Text>
            <Row>
              <Button label="Take a photo" variant="secondary" style={{ flex: 1 }} onPress={takePhoto} />
              <Button label="Choose a file" variant="secondary" style={{ flex: 1 }} onPress={pickFile} />
            </Row>
            {asset ? <Text style={styles.attached} numberOfLines={1}>Attached: {asset.name}</Text> : null}

            <Row style={{ marginTop: spacing.lg }}>
              <Button label="Send it" onPress={submit} busy={busy} style={{ flex: 1 }} />
              <Button
                label="Cancel" variant="ghost" style={{ flex: 1 }}
                onPress={() => { setFormOpen(false); resetForm(); setActionError(null); }}
              />
            </Row>
          </Card>
        ) : null}

        <ErrorNotice message={error ?? actionError} />
        <SuccessNotice message={notice} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}><ListSkeleton /></View>
      ) : (
        <FlatList
          data={credentials}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Card><EmptyState message="Nothing here yet. Add a certificate and somebody will check it." /></Card>}
          ListFooterComponent={
            <View style={{ marginTop: spacing.lg }}>
              <RestrictedNotice message="Checking a certificate — anyone's, including your own — is desktop work." />
            </View>
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
                <Badge label={item.status} />
              </Row>
              <Text style={styles.meta}>
                {item.type?.name ?? 'Other'}
                {item.issuer ? ` · ${item.issuer}` : ''}
                {item.expires_on ? ` · expires ${formatDate(item.expires_on)}` : ''}
              </Text>
              {item.status === 'Rejected' && item.review_note ? (
                <Text style={styles.rejected}>Sent back: {item.review_note}</Text>
              ) : null}
              {item.status === 'Verified' && item.verified_at ? (
                <Text style={styles.meta}>
                  Checked by {item.verifier?.name ?? 'a reviewer'} on {formatDate(item.verified_at)}
                  {item.verification_method ? ` · ${item.verification_method}` : ''}
                </Text>
              ) : null}
              {item.document ? (
                <Button
                  label="Open the file" variant="secondary" style={{ marginTop: spacing.md }}
                  onPress={() => open(item.document!.storage_path, item.document!.id)}
                />
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
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkMuted, marginBottom: 6 },
  input: {
    minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.railStrong,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 15, color: colors.ink,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rail,
    fontSize: 13, fontWeight: '600', color: colors.inkMuted, overflow: 'hidden',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, color: colors.accentInk },
  attached: { marginTop: spacing.sm, fontSize: 13, color: colors.ok, fontWeight: '600' },
  guidance: { marginTop: spacing.sm, fontSize: 13, color: colors.inkMuted, lineHeight: 18 },
  meta: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  rejected: { marginTop: spacing.sm, fontSize: 14, color: colors.warn, lineHeight: 20 },
});

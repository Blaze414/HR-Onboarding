import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fieldErrors, friendlyError, initials, loginSchema, PRODUCT_NAME, PRODUCT_SUBTITLE,
} from '@snoopy/shared';
import { SnoopyMark } from '@/components/Snoopy';
import { Button, ErrorNotice } from '@/components/ui';
import { backendUrl, supabase } from '@/lib/supabase';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

const DEMO = [
  { email: 'charlie@peanutsstudio.test', who: 'Charlie Brown', where: 'Employee · Peanuts Creative Studio' },
  { email: 'lucy@peanutsstudio.test', who: 'Lucy van Pelt', where: 'Admin · Peanuts Creative Studio' },
  { email: 'linus@woodstockdigital.test', who: 'Linus van Pelt', where: 'Employee · Woodstock Digital' },
];

export default function LoginScreen() {
  const styles = useStyles(makeStyles);
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) { setFormError(friendlyError(error)); setBusy(false); }
      // On success the auth listener in AuthProvider navigates away.
    } catch (thrown) {
      // A request that never reaches the backend rejects rather than returning
      // an error, and without this the button would spin with nothing to read.
      setFormError(friendlyError(thrown));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <SnoopyMark size={44} />
        <Text style={[type.display, { marginTop: spacing.lg }]}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>{PRODUCT_SUBTITLE}</Text>

        <View style={{ height: spacing.xl }} />
        <ErrorNotice message={formError} />
        {formError ? (
          <Text style={styles.backend} accessibilityLabel={`Backend address ${backendUrl}`}>
            Tried {backendUrl}
          </Text>
        ) : null}

        <View style={styles.field}>
          <Text style={type.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            value={email} onChangeText={setEmail}
            autoCapitalize="none" autoComplete="email" keyboardType="email-address"
            placeholder="you@workplace.test" placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Email"
          />
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={type.label}>Password</Text>
          <TextInput
            style={[styles.input, errors.password && styles.inputError]}
            value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="current-password"
            placeholder="••••••••" placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Password" onSubmitEditing={submit}
          />
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
        </View>

        <Button label="Sign in" onPress={submit} busy={busy} style={{ marginTop: spacing.sm }} />

        <Text style={styles.demoTitle}>Demo accounts — password snoopy123</Text>
        {DEMO.map((d) => (
          <Pressable
            key={d.email}
            style={({ pressed }) => [styles.demo, pressed && { backgroundColor: colors.surfaceMuted }]}
            onPress={() => { setEmail(d.email); setPassword('snoopy123'); }}
            accessibilityRole="button"
            accessibilityLabel={`Use demo account ${d.who}`}
          >
            <View style={styles.demoAvatar}><Text style={styles.demoAvatarText}>{initials(d.who)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{d.who}</Text>
              <Text style={styles.demoWhere}>{d.where}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, backgroundColor: colors.bg, flexGrow: 1 },
  subtitle: { fontSize: 15, color: colors.inkMuted, marginTop: 4 },
  field: { marginBottom: spacing.lg, gap: 6 },
  input: {
    minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.railStrong,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, fontSize: 16, color: colors.ink,
  },
  inputError: { borderColor: colors.accent },
  errorText: { color: colors.accentInk, fontSize: 13 },
  backend: {
    fontSize: 11.5,
    color: colors.inkSubtle,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  demoTitle: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: 13, color: colors.inkSubtle },
  demo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56,
    paddingHorizontal: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.rail, backgroundColor: colors.surface, marginBottom: spacing.sm,
  },
  demoAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  demoAvatarText: { color: colors.accentInk, fontWeight: '800', fontSize: 12 },
  demoWhere: { fontSize: 12.5, color: colors.inkSubtle },
});

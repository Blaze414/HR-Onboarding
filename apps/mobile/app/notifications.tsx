import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService, timeAgo, type AppNotification } from '@snoopy/shared';
import { Button, EmptyState, ErrorNotice, ListSkeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { radius, spacing, type Colors, useStyles, useTheme } from '@/theme';

export default function NotificationsScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  // Rows that have been read in this session, so a tap settles at once rather
  // than waiting for the round trip.
  const [seen, setSeen] = useState<Set<string>>(new Set());

  const { data, loading, refreshing, error, refresh, reload } = useLoad(
    async () => (profile ? notificationService.list(supabase, profile.id, 50) : []),
    [profile?.id],
  );

  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at && !seen.has(n.id)).length;

  async function open(item: AppNotification) {
    setSeen((s) => new Set(s).add(item.id));
    if (!item.read_at) await notificationService.markRead(supabase, item.id).catch(() => {});
    if (item.href) {
      // Paths are stored desktop-first; the mobile app carries the same routes
      // for the screens it has, and falls back to the section for those it does not.
      const route = item.href.startsWith('/onboarding') ? '/onboarding' : item.href;
      router.push(route as never);
    }
  }

  async function markAll() {
    if (!profile) return;
    setSeen(new Set(items.map((n) => n.id)));
    await notificationService.markAllRead(supabase, profile.id).catch(() => {});
    reload();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          {unread > 0 ? `${unread} waiting on you` : 'Nothing waiting on you'}
        </Text>
        {unread > 0 ? <Button label="Mark all read" variant="ghost" onPress={markAll} /> : null}
      </View>

      <ErrorNotice message={error} />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <EmptyState message="You are up to date. Anything needing your attention will appear here." />
          }
          renderItem={({ item }) => {
            const isUnread = !item.read_at && !seen.has(item.id);
            return (
              <Pressable
                onPress={() => open(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${isUnread ? ', unread' : ''}`}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {isUnread ? <View style={styles.dot} /> : null}
                  </View>
                  {item.body ? <Text style={styles.body} numberOfLines={2}>{item.body}</Text> : null}
                  <Text style={styles.when}>{timeAgo(item.created_at)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
    sub: { color: colors.inkMuted, fontSize: 13, marginTop: 2 },
    row: {
      flexDirection: 'row',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rail,
    },
    rowPressed: { backgroundColor: colors.surfaceMuted },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    title: { color: colors.ink, fontSize: 14.5, lineHeight: 20, flexShrink: 1 },
    titleUnread: { fontWeight: '600' },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
    body: { color: colors.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
    when: { color: colors.inkSubtle, fontSize: 11, marginTop: 4 },
  });
}

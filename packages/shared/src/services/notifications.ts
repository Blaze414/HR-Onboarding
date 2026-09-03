import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification } from '../types';
import { LOCALE } from '../utils';

/**
 * Notifications are written by database triggers, never by a client, so this
 * service only reads them and marks them seen. RLS already restricts every row
 * to its recipient — the `user_id` filters below are for the query planner and
 * for readability, not for security.
 */
export const notificationService = {
  /**
   * Raises reminders for required training that is due soon or already late,
   * and escalates the late ones to the learner's manager.
   *
   * Safe to call on every page load: the database refuses to raise the same
   * reminder twice, so this needs no scheduler to be correct — a scheduler only
   * makes it timely for people who are not logged in.
   */
  async sweepDeadlines(db: SupabaseClient): Promise<number> {
    const { data, error } = await db.rpc('notify_training_deadlines');
    if (error) throw error;
    return (data as number) ?? 0;
  },

  async list(db: SupabaseClient, userId: string, limit = 30): Promise<AppNotification[]> {
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },

  async unreadCount(db: SupabaseClient, userId: string): Promise<number> {
    const { count, error } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(db: SupabaseClient, id: string): Promise<void> {
    const { error } = await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async markAllRead(db: SupabaseClient, userId: string): Promise<void> {
    const { error } = await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
  },
};

/** "just now", "12m", "3h", "5d" — compact enough for a list row. */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/**
 * How a required course stands against its due date. Returned as a state rather
 * than a formatted string so each client can present it in its own voice.
 */
export type DueState = 'none' | 'upcoming' | 'due_soon' | 'overdue' | 'done';

export function dueState(
  assignment: { is_required: boolean; due_date: string | null; status: string },
  today = new Date(),
): DueState {
  if (assignment.status === 'Completed') return 'done';
  if (!assignment.is_required || !assignment.due_date) return 'none';
  const due = new Date(`${assignment.due_date}T23:59:59`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'due_soon';
  return 'upcoming';
}

export function dueLabel(assignment: { due_date: string | null }, state: DueState): string {
  if (!assignment.due_date || state === 'none') return '';
  const due = new Date(`${assignment.due_date}T00:00:00`);
  const date = due.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  if (state === 'overdue') return `Overdue since ${date}`;
  if (state === 'done') return `Completed`;
  return `Due ${date}`;
}

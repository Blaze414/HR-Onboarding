import type { Db } from '../supabase';
import type { EventParticipant, EventResponse, WorkEvent } from '../types';
import { logActivity } from './activity';

const SELECT =
  '*, participants:event_participants(*, user:profiles!event_participants_user_id_fkey(id,name))';

export async function listEvents(db: Db, opts: { upcomingOnly?: boolean; search?: string } = {}) {
  let query = db.from('events').select(SELECT).order('start_time', { ascending: true });
  if (opts.upcomingOnly) query = query.gte('start_time', new Date().toISOString());
  if (opts.search) query = query.ilike('title', `%${opts.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WorkEvent[];
}

export async function getEvent(db: Db, id: string): Promise<WorkEvent | null> {
  const { data, error } = await db.from('events').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as WorkEvent) ?? null;
}

export async function createEvent(
  db: Db, organisationId: string, actorId: string,
  input: Partial<WorkEvent> & { title: string; start_time: string },
): Promise<WorkEvent> {
  const { data, error } = await db.from('events')
    .insert({ ...input, organisation_id: organisationId, created_by: actorId })
    .select(SELECT).single();
  if (error) throw error;
  await logActivity(db, {
    organisationId, actorId, action: 'created_event',
    entityType: 'event', entityId: data.id, metadata: { title: data.title },
  });
  return data as WorkEvent;
}

export async function updateEvent(db: Db, id: string, patch: Partial<WorkEvent>) {
  const { data, error } = await db.from('events').update(patch).eq('id', id).select(SELECT).single();
  if (error) throw error;
  return data as WorkEvent;
}

export async function deleteEvent(db: Db, id: string) {
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) throw error;
}

/** RSVP. Employees may only write their own participation row. */
export async function respondToEvent(
  db: Db, organisationId: string, eventId: string, userId: string, response: EventResponse,
): Promise<EventParticipant> {
  const { data, error } = await db.from('event_participants')
    .upsert(
      { organisation_id: organisationId, event_id: eventId, user_id: userId, response },
      { onConflict: 'event_id,user_id' },
    )
    .select('*').single();
  if (error) throw error;
  return data as EventParticipant;
}

export async function setParticipants(
  db: Db, organisationId: string, eventId: string, userIds: string[],
) {
  const { error: delError } = await db.from('event_participants').delete().eq('event_id', eventId);
  if (delError) throw delError;
  if (userIds.length === 0) return;
  const { error } = await db.from('event_participants').insert(
    userIds.map((user_id) => ({ organisation_id: organisationId, event_id: eventId, user_id })),
  );
  if (error) throw error;
}

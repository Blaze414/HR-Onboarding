'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDateTime, type EventResponse, type WorkEvent } from '@snoopy/shared';
import { Icon } from './Icon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday-first grid covering the whole month, padded to full weeks. */
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  // Drop a trailing week that belongs entirely to the next month.
  return days.slice(0, days[35].getMonth() === cursor.getMonth() ? 42 : 35);
}

export function EventCalendar({
  events, userId, canCreate,
}: { events: WorkEvent[]; userId: string; canCreate: boolean }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(dayKey(today));

  // Events are grouped once per render rather than filtered inside every cell.
  const byDay = useMemo(() => {
    const map = new Map<string, WorkEvent[]>();
    for (const e of events) {
      const key = dayKey(new Date(e.start_time));
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [events]);

  const days = monthGrid(cursor);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedEvents = byDay.get(selected) ?? [];
  const selectedDate = new Date(`${selected}T00:00:00`);

  const shiftMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="calendar-layout">
      <section className="card">
        <div className="card-head">
          <h2>{monthLabel}</h2>
          <div className="row">
            <button className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <span style={{ display: 'flex', transform: 'rotate(180deg)' }}><Icon name="chevronRight" size={15} /></span>
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelected(dayKey(today));
              }}
            >
              Today
            </button>
            <button className="btn btn-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="calendar-grid calendar-head" aria-hidden>
            {WEEKDAYS.map((d) => <span key={d} className="calendar-weekday">{d}</span>)}
          </div>

          <div className="calendar-grid" role="grid" aria-label={`Events in ${monthLabel}`}>
            {days.map((day) => {
              const key = dayKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const outside = day.getMonth() !== cursor.getMonth();
              const isToday = key === dayKey(today);

              return (
                <button
                  key={key}
                  role="gridcell"
                  className={[
                    'calendar-day',
                    outside ? 'outside' : '',
                    isToday ? 'today' : '',
                    key === selected ? 'selected' : '',
                    dayEvents.length ? 'has-events' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelected(key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${day.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${
                    dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ', no events'
                  }`}
                >
                  <span className="calendar-date">{day.getDate()}</span>
                  {dayEvents.length ? (
                    <span className="calendar-dots" aria-hidden>
                      {dayEvents.slice(0, 3).map((e) => <span key={e.id} className="calendar-dot" />)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {canCreate ? (
            <Link className="btn btn-sm btn-primary" href={`/events/new?date=${selected}`}>
              <Icon name="plus" size={15} /> Add
            </Link>
          ) : null}
        </div>

        <div className="card-body">
          {selectedEvents.length === 0 ? (
            <p className="muted">Nothing scheduled on this day.</p>
          ) : (
            <div className="stack">
              {selectedEvents.map((e) => {
                const mine = e.participants?.find((p) => p.user_id === userId);
                return (
                  <Link key={e.id} href={`/events/${e.id}`} className="day-event">
                    <span className="time">
                      {new Date(e.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="title">{e.title}</span>
                      <span className="subtle" style={{ display: 'block' }}>
                        {e.location ?? 'No location'} · {e.participants?.length ?? 0} invited
                      </span>
                    </span>
                    {mine?.response ? <span className="badge">{mine.response as EventResponse}</span> : null}
                  </Link>
                );
              })}
            </div>
          )}

          {selectedEvents.length > 0 ? (
            <p className="subtle" style={{ marginTop: 14 }}>
              Next up {formatDateTime(selectedEvents[0].start_time)}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

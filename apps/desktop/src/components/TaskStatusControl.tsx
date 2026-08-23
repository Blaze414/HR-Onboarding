'use client';

import { TASK_STATUSES, type TaskStatus } from '@snoopy/shared';
import { setTaskStatusAction } from '@/lib/actions';
import { useAction } from './Interactive';

export function TaskStatusControl({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const { busy, error, call } = useAction();
  return (
    <div className="row">
      <select
        className="select" aria-label="Task status" value={status} disabled={busy}
        onChange={(e) => call(() => setTaskStatusAction(taskId, e.target.value))}
      >
        {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {status !== 'Completed' ? (
        <button className="btn btn-sm" disabled={busy} onClick={() => call(() => setTaskStatusAction(taskId, 'Completed'))}>
          {busy ? 'Saving…' : 'Mark complete'}
        </button>
      ) : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

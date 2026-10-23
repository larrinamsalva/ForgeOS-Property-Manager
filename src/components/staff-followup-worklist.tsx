'use client';

import { useState } from 'react';
import type { AccountNote } from '@/lib/collections-domain';
import { staffFollowupTasks, type StaffFollowupState } from '@/lib/staff-followup-worklist';

type TaskView = 'all' | StaffFollowupState;

export function StaffFollowupWorklist({
  notes, propertyId, today, customerName, canResolve, onResolve,
}: {
  notes: AccountNote[];
  propertyId: string;
  today: string;
  customerName: (id: string) => string;
  canResolve: (note: AccountNote) => boolean;
  onResolve: (noteId: string) => void;
}) {
  const [view, setView] = useState<TaskView>('all');
  const [search, setSearch] = useState('');
  const tasks = staffFollowupTasks(notes,propertyId,today);
  const due = tasks.filter(task => task.state === 'due').length;
  const scheduled = tasks.length - due;
  const match = search.toLocaleLowerCase().trim();
  const filtered = tasks.filter(task =>
    (view === 'all' || task.state === view) &&
    (!match || (customerName(task.note.customer_id) + ' ' + task.note.body)
      .toLocaleLowerCase().includes(match)));

  return (
    <section className="staff-followup-worklist" aria-label="Staff follow-up worklist">
      <div className="staff-followup-heading">
        <div>
          <h3>Staff follow-up worklist</h3>
          <p className="muted small">
            Outstanding manual tasks from recorded account notes, contact attempts
            and payment arrangements. Paid balances do not automatically close tasks.
          </p>
        </div>
        <p className="staff-followup-totals" role="status">
          <strong>{due} due</strong> · {scheduled} scheduled
        </p>
      </div>
      <div className="staff-followup-controls">
        <div className="action-group" role="group" aria-label="Follow-up status filter">
          {([
            ['all', 'All open tasks'],
            ['due', 'Due'],
            ['scheduled', 'Scheduled'],
          ] as [TaskView, string][]).map(([status, label]) => (
            <button type="button" key={status}
              className={'button ' + (view === status ? 'primary' : 'secondary')}
              aria-pressed={view === status} onClick={() => setView(status)}>
              {label}
            </button>
          ))}
        </div>
        <label>Find resident or task
          <input type="search" aria-label="Find follow-up task" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resident or note" />
        </label>
      </div>
      {!filtered.length ? (
        <p className="muted small">
          {tasks.length
            ? 'No open follow-up tasks match these filters.'
            : 'No open staff follow-up tasks for this property or selected resident.'}
        </p>
      ) : (
        <div className="staff-followup-items">
          {filtered.map(({note,dueOn,state})=>(
            <article className="staff-followup-task" key={note.id}
              aria-label={'Staff task for ' + customerName(note.customer_id)}>
              <div className="staff-followup-task-heading">
                <strong>{customerName(note.customer_id)}</strong>
                <span className={'staff-task-status staff-task-' + state}>
                  {state === 'due' ? 'Due' : 'Scheduled'}
                </span>
              </div>
              <p><strong>Next action: {dueOn}</strong> · {note.kind === 'arrangement' ?
                'Payment arrangement' : note.body.startsWith('Manual past-due contact\n') ?
                  'Manual contact follow-up' : 'Staff account note'}</p>
              <p className="preserve-lines staff-followup-body">{note.body}</p>
              <small>Recorded {note.created_at} · Staff record {note.id.slice(0,8)}</small>
              {canResolve(note) && (
                <div className="staff-followup-actions">
                  <button type="button" className="button secondary"
                    onClick={()=>onResolve(note.id)}
                    aria-label={'Resolve staff task for ' + customerName(note.customer_id)}>
                    Review and resolve task
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="muted small">
        Due dates are staff follow-up dates, not legal notice deadlines.
        Resolving a task requires a reviewed note. Nothing here sends messages,
        modifies rent, posts a payment or changes any invoice.
      </p>
    </section>
  );
}

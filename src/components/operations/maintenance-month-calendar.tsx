'use client';
import { useState } from 'react';
import { opsLabel } from '@/lib/operations-domain';
import type { OpsUI } from './types';

export function MaintenanceMonthCalendar({ ui }: { ui: OpsUI }) {
  const [month, setMonth] = useState(ui.today.slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const lead = (monthStart.getUTCDay() + 6) % 7;
  const jobs = ui.data.work.filter(w => w.property_id === ui.propertyId &&
    w.due_on && !['completed', 'closed', 'cancelled'].includes(w.status));
  const byDate = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = job.due_on!;
    const dayJobs = byDate.get(key) ?? [];
    dayJobs.push(job);
    byDate.set(key, dayJobs);
  }
  for (const dayJobs of byDate.values()) dayJobs.sort((a, b) =>
    (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0) ||
    a.number.localeCompare(b.number));
  const shift = (delta: number) => {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - lead + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const dated = (day: number) => month + '-' + String(day).padStart(2, '0');
  const label = monthStart.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const overdue = jobs.filter(j => j.due_on! < ui.today);
  return (
    <section aria-label="Maintenance monthly calendar">
      <div className="panel-heading">
        <div><h3>Monthly maintenance calendar</h3><p>Open repair deadlines by property-local date. Select a job to view its work order.</p></div>
        <div className="action-group">
          <button type="button" className="button secondary" onClick={() => shift(-1)} aria-label="Previous month">Previous</button>
          <strong aria-live="polite">{label}</strong>
          <button type="button" className="button secondary" onClick={() => shift(1)} aria-label="Next month">Next</button>
          <button type="button" className="button secondary" onClick={() => setMonth(ui.today.slice(0, 7))}>Today</button>
        </div>
      </div>
      {overdue.length > 0 && <p className="ops-overdue">{overdue.length} open repair{overdue.length === 1 ? '' : 's'} overdue across all dates. Review overdue jobs in the work-order list above.</p>}
      <div className="table-wrap" role="region" aria-label={label + ' maintenance calendar'} tabIndex={0}>
        <table className="ops-maintenance-calendar">
          <thead><tr>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: cells.length / 7 }, (_, row) =>
            <tr key={row}>{cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              const date = day ? dated(day) : '';
              const dayJobs = day ? byDate.get(date) ?? [] : [];
              return <td key={col} style={{ minWidth: '115px', verticalAlign: 'top' }}>
                {day !== null && <>
                  <strong aria-label={date === ui.today ? 'Today, ' + date : date}>{day}{date === ui.today ? ' · Today' : ''}</strong>
                  {dayJobs.slice(0, 3).map(job =>
                    <div key={job.id}>
                      <button type="button" className="text-button"
                        onClick={() => ui.open('work_detail', job.id)}
                        aria-label={job.number + ', ' + job.title + ', ' + opsLabel(job.priority) + ', due ' + date}>
                        {job.number} · {opsLabel(job.priority)}
                      </button>
                      <small>{job.assigned_to ? ui.data.context.work.find(c => c.id === job.id)?.assigned_name ?? 'Assigned' : 'Unassigned'}</small>
                    </div>)}
                  {dayJobs.length > 3 && <small>+{dayJobs.length - 3} more jobs (see work orders)</small>}
                </>}
              </td>;
            })}</tr>
          )}</tbody>
        </table>
      </div>
      <p>Open jobs only; completed, closed and cancelled work are retained in work-order history. Dates without a due date appear in the scheduling summary above.</p>
    </section>
  );
}

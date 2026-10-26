import type { WorkOrder } from './operations-domain';

// Read-only worklist. Jobs already assigned to a worker remain visible even if overdue.
// Future scheduled jobs do not crowd today's assignments.
export function employeeTodayWork(
  work: readonly Pick<WorkOrder, 'id'|'title'|'property_id'|'assigned_to'|'priority'|'status'|'scheduled_for'|'due_on'>[],
  propertyId: string, today: string, employeeId: string,
) {
  return work.filter(w => w.property_id===propertyId && w.assigned_to===employeeId &&
    !['completed','closed','cancelled'].includes(w.status) &&
    (!w.scheduled_for || w.scheduled_for<=today))
    .sort((a,b) => {
      const rank=(w:typeof a)=> w.priority==='urgent'?0 :
        w.due_on && w.due_on<today?1 : w.priority==='high'?2 : w.priority==='normal'?3:4;
      return rank(a)-rank(b) || (a.due_on??'9999').localeCompare(b.due_on??'9999') || a.id.localeCompare(b.id);
    });
}

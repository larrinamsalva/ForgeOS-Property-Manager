import { checklistState, type ChecklistEntry, type ChecklistRun } from './operations-domain';

export function employeeChecklistProgress(
  runs: readonly ChecklistRun[], entries: ChecklistEntry[], today: string,
) {
  const groups = new Map<string, { assigneeId:string; runs:number; done:number; skipped:number; remaining:number }>();
  for(const run of runs) {
    if(run.scheduled_for!==today || run.status==='cancelled') continue;
    const id=run.assigned_to || 'unassigned';
    const row=groups.get(id)??{assigneeId:id,runs:0,done:0,skipped:0,remaining:0};
    row.runs++;
    for(const item of run.items) {
      const status=checklistState(entries,run.id,item.key)?.status;
      if(status==='done') row.done++;
      else if(status==='skipped') row.skipped++;
      else row.remaining++;
    }
    groups.set(id,row);
  }
  return [...groups.values()].sort((a,b)=>b.remaining-a.remaining || b.skipped-a.skipped || a.assigneeId.localeCompare(b.assigneeId));
}

import { describe, expect, it } from 'vitest';
import { employeeChecklistProgress } from '../../src/lib/employee-checklist-progress';
import type { ChecklistEntry, ChecklistRun } from '../../src/lib/operations-domain';

const runs = [
  {id:'run1',scheduled_for:'2026-10-25',status:'open',assigned_to:'alice',items:[{key:'a',label:'Sink'},{key:'b',label:'Floor'},{key:'c',label:'Trash'}]},
  {id:'run2',scheduled_for:'2026-10-25',status:'open',assigned_to:'bob',items:[{key:'a',label:'Patio'}]},
  {id:'run3',scheduled_for:'2026-10-26',status:'open',assigned_to:'alice',items:[{key:'a',label:'Next day'}]},
  {id:'run4',scheduled_for:'2026-10-25',status:'cancelled',assigned_to:'alice',items:[{key:'a',label:'Cancelled'}]},
] as ChecklistRun[];
const entries = [
  {id:'1',run_id:'run1',item_key:'a',status:'done',created_at:'2026-10-25T07:00:00Z'},
  {id:'2',run_id:'run1',item_key:'b',status:'skipped',created_at:'2026-10-25T08:00:00Z'},
  {id:'3',run_id:'run1',item_key:'c',status:'done',created_at:'2026-10-25T07:00:00Z'},
  {id:'4',run_id:'run1',item_key:'c',status:'reopen',created_at:'2026-10-25T09:00:00Z'},
] as ChecklistEntry[];
describe('supervisor checklist progress',()=>{
  it('separates completed, skipped and reopened results by assigned employee',()=>{
    expect(employeeChecklistProgress(runs,entries,'2026-10-25')).toEqual([
      {assigneeId:'alice',runs:1,done:1,skipped:1,remaining:1},
      {assigneeId:'bob',runs:1,done:0,skipped:0,remaining:1},
    ]);
  });
  it('excludes other days and cancelled runs',()=>{
    expect(employeeChecklistProgress(runs,entries,'2026-10-27')).toEqual([]);
  });
});

import {describe,expect,it} from 'vitest';
import {employeeTodayWork} from '../../src/lib/employee-today-work';
import type {WorkOrder} from '../../src/lib/operations-domain';
const work=[
 {id:'later',property_id:'park',assigned_to:'worker',priority:'normal',status:'assigned',scheduled_for:'2026-10-27',due_on:'2026-10-28'},
 {id:'normal',property_id:'park',assigned_to:'worker',priority:'normal',status:'assigned',scheduled_for:'2026-10-25',due_on:null},
 {id:'urgent',property_id:'park',assigned_to:'worker',priority:'urgent',status:'in_progress',scheduled_for:null,due_on:null},
 {id:'overdue',property_id:'park',assigned_to:'worker',priority:'normal',status:'waiting_parts',scheduled_for:'2026-10-20',due_on:'2026-10-24'},
 {id:'finished',property_id:'park',assigned_to:'worker',priority:'urgent',status:'completed',scheduled_for:null,due_on:null},
 {id:'other-worker',property_id:'park',assigned_to:'other',priority:'urgent',status:'assigned',scheduled_for:null,due_on:null},
 {id:'other-park',property_id:'elsewhere',assigned_to:'worker',priority:'urgent',status:'assigned',scheduled_for:null,due_on:null},
] as unknown as WorkOrder[];
describe('employee daily worklist',()=>{
 it('shows only authorized-assignment jobs due for attention today, urgent and overdue first',()=>{
  expect(employeeTodayWork(work,'park','2026-10-25','worker').map(w=>w.id))
    .toEqual(['urgent','overdue','normal']);
 });
 it('excludes completed jobs, future scheduled work and other users or properties',()=>{
  expect(employeeTodayWork(work,'park','2026-10-25','nobody')).toEqual([]);
  expect(employeeTodayWork(work,'elsewhere','2026-10-25','worker').map(w=>w.id))
    .toEqual(['other-park']);
 });
});

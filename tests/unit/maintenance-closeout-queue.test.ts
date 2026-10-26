import {describe,it,expect} from 'vitest';
import {maintenanceCloseoutQueue} from '../../src/lib/maintenance-closeout-queue';
import type {WorkOrder,WorkPhoto,WorkEvent} from '../../src/lib/operations-domain';
describe('maintenance closeout queue',()=>{
 it('uses only saved evidence for completed and closed repairs within the selected property',()=>{
 const work=[{id:'a',property_id:'p',status:'completed',completed_on:'2026-10-25',number:'1',title:'Leak'},
 {id:'b',property_id:'p',status:'closed',completed_on:'2026-10-24',number:'2',title:'Door'},
 {id:'c',property_id:'q',status:'completed',completed_on:'2026-10-25'},
 {id:'d',property_id:'p',status:'in_progress',completed_on:null}] as WorkOrder[];
 const photos=[{property_id:'p',work_order_id:'a',status:'uploaded',kind:'before'},
 {property_id:'p',work_order_id:'a',status:'uploaded',kind:'after'},
 {property_id:'p',work_order_id:'a',status:'voided',kind:'after'},
 {property_id:'q',work_order_id:'a',status:'uploaded',kind:'after'}] as WorkPhoto[];
 const events=[{property_id:'p',work_order_id:'a',body:'Replaced seal'},
 {property_id:'p',work_order_id:'a',body:'  '}] as WorkEvent[];
 const rows=maintenanceCloseoutQueue(work,photos,events,'p','2026-10-25');
 expect(rows.map(r=>r.work.id)).toEqual(['a','b']);
 expect(rows[0]).toMatchObject({before:1,after:1,notes:1,awaitingApproval:true,completedToday:true});
 expect(rows[1]).toMatchObject({before:0,after:0,notes:0,awaitingApproval:false});
 });
});

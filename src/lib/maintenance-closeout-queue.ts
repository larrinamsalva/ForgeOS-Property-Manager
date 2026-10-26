import type {WorkOrder,WorkPhoto,WorkEvent} from './operations-domain';
export function maintenanceCloseoutQueue(work:readonly WorkOrder[],photos:readonly WorkPhoto[],events:readonly WorkEvent[],propertyId:string,today:string){
 return work.filter(w=>w.property_id===propertyId&&['completed','closed'].includes(w.status)).map(w=>{
  const relevant=photos.filter(p=>p.property_id===propertyId&&p.work_order_id===w.id&&p.status==='uploaded');
  const notes=events.filter(e=>e.property_id===propertyId&&e.work_order_id===w.id&&e.body.trim().length>0);
  return {work:w,before:relevant.filter(p=>p.kind==='before').length,after:relevant.filter(p=>p.kind==='after').length,
    notes:notes.length,awaitingApproval:w.status==='completed',completedToday:w.completed_on===today};
 }).sort((a,b)=>Number(b.awaitingApproval)-Number(a.awaitingApproval)||
  (b.work.completed_on??'').localeCompare(a.work.completed_on??'')||a.work.id.localeCompare(b.work.id));
}

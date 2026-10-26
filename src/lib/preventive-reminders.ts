import type {Equipment,OpsPlan} from './operations-domain';

export function preventiveReminders(
 equipment:readonly Pick<Equipment,'id'|'property_id'|'name'|'next_service_on'|'archived'>[],
 plans:readonly Pick<OpsPlan,'id'|'property_id'|'label'|'anchor_on'|'interval_days'|'ends_on'|'active'>[],
 propertyId:string,today:string,through:string,
) {
 const items:{id:string;label:string;date:string;kind:'equipment'|'plan';state:'overdue'|'upcoming'}[]=[];
 for(const e of equipment){
  if(e.property_id!==propertyId||e.archived||!e.next_service_on||e.next_service_on>through)continue;
  items.push({id:e.id,label:e.name,date:e.next_service_on,kind:'equipment',state:e.next_service_on<today?'overdue':'upcoming'});
 }
 // A recurring plan's due date is calculated from its anchored calendar-day interval.
 // This is a planning reminder, not evidence that a run has or has not been completed.
 for(const p of plans){
  if(p.property_id!==propertyId||!p.active||p.interval_days<1)continue;
  const start=Date.parse(p.anchor_on+'T00:00:00Z');
  const current=Date.parse(today+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(current))continue;
  const interval=p.interval_days*86400000;
  const index=Math.max(0,Math.ceil((current-start)/interval));
  const next=new Date(start+index*interval).toISOString().slice(0,10);
  if(next>through||(p.ends_on&&next>p.ends_on))continue;
  items.push({id:p.id,label:p.label,date:next,kind:'plan',state:'upcoming'});
 }
 return items.sort((a,b)=>Number(a.state!=='overdue')-Number(b.state!=='overdue')||a.date.localeCompare(b.date)||a.label.localeCompare(b.label));
}

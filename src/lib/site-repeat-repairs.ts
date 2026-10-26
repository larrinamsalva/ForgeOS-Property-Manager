import type { WorkOrder } from './operations-domain';

/** Signals possible recurring repairs, not a diagnosis or an automatic work order. */
export function siteRepeatRepairAlerts(
  work: readonly Pick<WorkOrder,'id'|'property_id'|'site_id'|'category'|'status'|'requested_on'>[],
  propertyId:string,siteId:string,fromDate:string,
) {
  const groups = new Map<string,{category:string;count:number;latest:string}>();
  for(const row of work){
    if(row.property_id!==propertyId||row.site_id!==siteId||
      row.status==='cancelled'||row.requested_on<fromDate)continue;
    const category=row.category.trim().toLowerCase() || 'uncategorized';
    const found=groups.get(category)??{category,count:0,latest:''};
    found.count++;
    if(row.requested_on>found.latest)found.latest=row.requested_on;
    groups.set(category,found);
  }
  return [...groups.values()].filter(g=>g.count>=3)
    .sort((a,b)=>b.count-a.count||b.latest.localeCompare(a.latest)||a.category.localeCompare(b.category));
}

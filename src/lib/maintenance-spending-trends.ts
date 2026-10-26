import type {WorkCost,WorkOrder} from './operations-domain';

// Gross recorded direct maintenance expenses only. Estimates, inventory movements,
// returns and refunds are different accounting concepts and not included.
export function maintenanceSpendingTrends(
  work:readonly Pick<WorkOrder,'id'|'property_id'|'site_id'|'category'>[],
  costs:readonly Pick<WorkCost,'property_id'|'work_order_id'|'kind'|'amount_cents'|'created_at'>[],
  propertyIds:readonly string[],
  startsOn:string,
) {
  const authorized=new Set(propertyIds);
  const orders=new Map(work.filter(w=>authorized.has(w.property_id)).map(w=>[w.id,w]));
  const month=new Map<string,bigint>(), category=new Map<string,bigint>(), site=new Map<string,bigint>();
  for(const cost of costs){
    const order=orders.get(cost.work_order_id);
    if(!order||cost.property_id!==order.property_id||cost.kind!=='expense'||cost.created_at.slice(0,10)<startsOn)continue;
    const amount=BigInt(cost.amount_cents);
    const add=(map:Map<string,bigint>,key:string)=>map.set(key,(map.get(key)??0n)+amount);
    add(month,order.property_id+'|'+cost.created_at.slice(0,7));
    add(category,order.property_id+'|'+(order.category.trim()||'Uncategorized'));
    if(order.site_id)add(site,order.property_id+'|'+order.site_id);
  }
  const rows=(map:Map<string,bigint>)=>[...map].map(([key,amount])=>({key,amountCents:amount.toString()}))
    .sort((a,b)=>BigInt(b.amountCents)>BigInt(a.amountCents)?1:BigInt(b.amountCents)<BigInt(a.amountCents)?-1:a.key.localeCompare(b.key));
  return {monthly:rows(month),categories:rows(category),sites:rows(site)};
}

import type {PurchaseRequest} from './operations-domain';

type RequestState=Pick<PurchaseRequest,'item_id'|'property_id'|'quantity_milli'|'status'>;
export type ExistingRestockRequests={
 count:number;
 open:number;
 approved:number;
 ordered:number;
 requestedMilli:string;
};

/** Purchase request status is not proof that a supplier was contacted or
 * stock was received. Report outstanding recorded requests, without
 * subtracting them from on-hand inventory or changing purchase permissions.
 * Neither declined, cancelled nor fulfilled records imply a pending request.
 */
export function existingRestockRequests(
 requests:readonly RequestState[],
 propertyId:string,
 itemId:string,
):ExistingRestockRequests{
 const result:ExistingRestockRequests={
  count:0,open:0,approved:0,ordered:0,requestedMilli:'0',
 };
 if(!propertyId||!itemId)return result;
 let total=0n;
 for(const row of requests){
  if(row.property_id!==propertyId||row.item_id!==itemId||
    (row.status!=='open'&&row.status!=='approved'&&row.status!=='ordered'))continue;
  result.count+=1;
  result[row.status]+=1;
  const quantity=BigInt(row.quantity_milli);
  if(quantity>0n)total+=quantity;
 }
 return {...result,requestedMilli:total.toString()};
}

/** Human readable status split with no customer or employee information. */
export function existingRestockStatusText(
 summary:ExistingRestockRequests,
):string{
 const labels=[
  summary.open?`${summary.open} awaiting decision`:'',
  summary.approved?`${summary.approved} approved`:'',
  summary.ordered?`${summary.ordered} marked ordered`:'',
 ].filter(Boolean);
 return labels.join(' · ');
}

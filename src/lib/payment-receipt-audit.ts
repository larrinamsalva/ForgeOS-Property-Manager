import type {CollectionsSnapshot} from './collections-domain';

/** Read-only inconsistencies to investigate; the server ledger remains authoritative. */
export function paymentReceiptAudit(data:Pick<CollectionsSnapshot,'payments'|'paymentEvents'|'receipts'|'summary'>,propertyId:string,customerId=''){
 const scoped=<T extends {property_id:string;customer_id:string}>(rows:readonly T[])=>rows.filter(r=>r.property_id===propertyId&&(!customerId||r.customer_id===customerId));
 const payments=scoped(data.payments);
 const receipts=scoped(data.receipts);
 const events=scoped(data.paymentEvents);
 const accountById=new Map(scoped(data.summary.accounts).map(a=>[a.invoice_id,a]));
 const paymentById=new Map(payments.map(p=>[p.id,p]));
 const issues:{key:string;message:string}[]=[];
 const add=(key:string,message:string)=>issues.push({key,message});
 for(const p of payments){
  if(!receipts.some(r=>r.source_kind==='payment'&&r.source_id===p.id&&r.customer_id===p.customer_id))
   add('receipt:'+p.id,'Payment has no matching receipt record');
 }
 for(const e of events){
  const p=paymentById.get(e.payment_id);
  if(!p||p.customer_id!==e.customer_id)add('source:'+e.id,'Payment event does not match a payment in this customer account');
  if(e.invoice_id){
   const account=accountById.get(e.invoice_id);
   if(!account||account.customer_id!==e.customer_id)add('account:'+e.id,'Payment event invoice is missing or belongs to another customer');
  }
 }
 for(const a of scoped(data.summary.accounts)){
  if(BigInt(a.outstanding_cents)<0n)add('overpaid:'+a.invoice_id,'Invoice outstanding balance is negative; review overpayment');
 }
 const seen=new Map<string,string>();
 for(const p of payments){
  const ref=p.reference.trim().toLowerCase();
  if(!ref)continue;
  const key=p.customer_id+'|'+p.method+'|'+ref;
  if(seen.has(key))add('duplicate:'+p.id,'Possible duplicate payment reference; compare receipts');
  else seen.set(key,p.id);
 }
 return issues;
}

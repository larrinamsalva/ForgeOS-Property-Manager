import type {CollectionAccount} from './collections-domain';

/** Compare ledger-provided account totals; never reconstruct authoritative balances from events. */
export function accountBalanceReview(accounts:readonly CollectionAccount[],propertyId:string,customerId=''){
 return accounts.filter(a=>a.property_id===propertyId&&(!customerId||a.customer_id===customerId))
 .flatMap(a=>{
  if(!a.issued_on||a.state==='voided')return [];
  const adjusted=BigInt(a.adjusted_cents),allocated=BigInt(a.allocated_cents),outstanding=BigInt(a.outstanding_cents);
  const warnings:string[]=[];
  if(adjusted-allocated!==outstanding)warnings.push('Account totals do not reconcile: adjusted minus allocated differs from outstanding');
  if(allocated<0n)warnings.push('Allocated total is negative');
  if(outstanding<0n)warnings.push('Outstanding balance is negative');
  if((a.state==='paid'&&outstanding!==0n)||(a.state==='partially_paid'&&allocated<=0n))
   warnings.push('Invoice payment status does not match ledger totals');
  return warnings.map((message,i)=>({key:a.invoice_id+':'+i,invoiceId:a.invoice_id,number:a.number,message}));
 });
}

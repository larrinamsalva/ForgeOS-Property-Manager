import {describe,it,expect} from 'vitest';
import {paymentReceiptAudit} from '../../src/lib/payment-receipt-audit';
import type {CollectionsSnapshot} from '../../src/lib/collections-domain';

const payment=(id:string,customer_id:string,reference:string,property_id='park')=>
 ({id,customer_id,reference,property_id,method:'cash',amount_cents:'10000'});
const data={
 payments:[payment('p1','alice','CASH-01'),payment('p2','alice','cash-01'),payment('private','bob','B-33','other')],
 paymentEvents:[
 {id:'e1',property_id:'park',customer_id:'alice',payment_id:'p1',invoice_id:'bill-bob',kind:'allocation'},
 {id:'e2',property_id:'park',customer_id:'alice',payment_id:'missing',invoice_id:null,kind:'refund'},
 ],
 receipts:[{id:'r1',property_id:'park',customer_id:'alice',source_kind:'payment',source_id:'p1'}],
 summary:{accounts:[{invoice_id:'bill-bob',property_id:'park',customer_id:'bob',outstanding_cents:'500'},
 {invoice_id:'bill-alice',property_id:'park',customer_id:'alice',outstanding_cents:'-1'}]},
} as unknown as CollectionsSnapshot;
describe('read-only payment receipt review',()=>{
 it('detects missing receipts, duplicate references, foreign invoice allocation and negative balance',()=>{
  const issues=paymentReceiptAudit(data,'park','alice');
  expect(issues.map(i=>i.key)).toEqual(['receipt:p2','account:e1','source:e2','overpaid:bill-alice','duplicate:p2']);
 });
 it('limits review to selected property and customer',()=>{
  expect(paymentReceiptAudit(data,'other','alice')).toEqual([]);
  expect(paymentReceiptAudit(data,'park','bob')).toEqual([]);
 });
});

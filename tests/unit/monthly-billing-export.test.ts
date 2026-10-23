import { describe, expect, it } from 'vitest';
import { monthlyBillingCsv } from '../../src/lib/monthly-billing-export';
import type { MonthlyRunRow } from '../../src/lib/monthly-billing-run';
const base: MonthlyRunRow = {
 siteId:'site',siteLabel:'Space 88',stayId:'stay',customerId:'resident',
 status:'review',period:{startsOn:'2026-09-01',endsOn:'2026-10-01',dueOn:'2026-10-05',isFutureClosing:false},
 warnings:['electric boundary readings'],checklist:[
  {label:'electric boundary readings',note:'Requires supervisor review',state:'check'},
 ],invoices:[],
};
describe('private, manager-initiated monthly billing CSV',()=>{
 it('exports actionable missing meter evidence and the exact visible stay only',()=>{
  const content=monthlyBillingCsv('RV Park','2026-09',[base],new Map([['resident','Taylor Resident']]));
  expect(content).toContain('Space 88');
  expect(content).toContain('Taylor Resident');
  expect(content).toContain('Requires supervisor review');
  expect(content).toContain('2026-10-05');
  expect(content).not.toContain('Other Resident');
  expect(content.split('\r\n')).toHaveLength(3);
 });
 it('exports only actual invoice totals and distinguishes approved/issued from drafts',()=>{
  const row={...base,status:'existing' as const,warnings:[],invoices:[
   {id:'i1',number:'INV-1',status:'approved' as const,totalCents:'2345',issued:false},
   {id:'i2',number:'INV-2',status:'approved' as const,totalCents:'1560',issued:true},
  ]};
  const content=monthlyBillingCsv('RV Park','2026-09',[row],new Map());
  expect(content).toContain('Approved, unissued; Issued');
  expect(content).toContain('$23.45; $15.60');
  expect(content).not.toContain('estimate');
 });
 it('escapes spreadsheet formulas in user-entered site names and descriptions',()=>{
  const row={...base,siteLabel:'=HYPERLINK("bad", "click")',
   checklist:[{label:'note',state:'check' as const,note:'@SUM(1,2)'}]};
  const result=monthlyBillingCsv('RV Park','2026-09',[row],new Map());
  expect(result).toContain("'=HYPERLINK");
  expect(result).toContain('note: @SUM(1,2)');
  expect(result).not.toContain('"=HYPERLINK');
 });
 it('empty filters export only a header and never pull hidden rows',()=>{
  const result=monthlyBillingCsv('RV Park','2026-09',[],new Map());
  expect(result).toContain('Site / unit');
  expect(result).not.toContain('Space 88');
  expect(result.split('\r\n')).toHaveLength(2);
 });
});

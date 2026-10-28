import {describe,it,expect} from 'vitest';
import {csv} from '../../src/lib/domain';
import {filterWaitingPartsRows,waitingPartsCsvRows,waitingPartsFilterChoices} from '../../src/lib/waiting-parts-handoff-review';
import type {WaitingPartsHandoffRow,WaitingPartsReason} from '../../src/lib/waiting-parts-handoff';
import type {WorkOrder} from '../../src/lib/operations-domain';

function repair(
 id:string,reason:WaitingPartsReason,
 property_id='park-a',
 priority:WorkOrder['priority']='normal',
):WaitingPartsHandoffRow{
 const work={
  id,property_id,number:'W-'+id,title:'Fix '+id,category:'plumbing',
  description:'Confidential repair notes. Resident phone 555-0101',
  customer_id:'private-customer',assigned_to:'private-user',
  status:'waiting_parts',priority,due_on:'2026-10-31',site_id:'space-1',
 } as WorkOrder;
 return {
  work,reason,propertyToday:'2026-10-27',
  linkedRequestCount:reason==='no_structured_request'?0:2,
  openRequestCount:reason==='open_request'?1:0,
  outstandingPlacedOrderCount:reason.includes('delivery')?1:0,
  lateOrderCount:reason==='late_linked_delivery'?1:0,
  noEtaOrderCount:reason==='missing_eta'?1:0,
  hasRecordedOnHand:reason==='verify_parts',
 };
}
const rows=[
 repair('late','late_linked_delivery'),
 repair('missing','no_structured_request','park-a','urgent'),
 repair('pending','open_request'),
 repair('eta','missing_eta','park-b'),
 repair('purchasing','purchasing_review'),
 repair('waiting','awaiting_linked_delivery'),
 repair('no-active','no_active_request'),
 repair('verify','verify_parts','park-b'),
 repair('urgent-delivery','awaiting_linked_delivery','park-a','urgent'),
];
const ids=(filter:Parameters<typeof filterWaitingPartsRows>[1],property='',query='')=>
 filterWaitingPartsRows(rows,filter,property,query).map(x=>x.work.id);
const properties=[{id:'park-a',name:'Park A'},{id:'park-b',name:'Park B'}];
const sites=[
 {id:'space-1',property_id:'park-a',label:'Site 88'},
 {id:'space-1',property_id:'park-b',label:'Apartment 12'},
];
describe('waiting repair handoff filters and export',()=>{
 it('keeps original attention ordering for every filter and never mutates the original list',()=>{
  expect(ids('all')).toEqual(rows.map(x=>x.work.id));
  expect(ids('no_request')).toEqual(['missing']);
  expect(ids('awaiting_decision')).toEqual(['pending']);
  expect(ids('delivery_attention')).toEqual(['late','eta']);
  expect(ids('purchasing_review')).toEqual(['purchasing','waiting','no-active','urgent-delivery']);
  expect(ids('verify_parts')).toEqual(['verify']);
  expect(ids('urgent')).toEqual(['missing','urgent-delivery']);
  expect(waitingPartsFilterChoices.length).toBe(7);
  expect(rows.map(x=>x.work.id)).toEqual(['late','missing','pending','eta','purchasing',
   'waiting','no-active','verify','urgent-delivery']);
 });
 it('scopes all filters and text search to the selected property',()=>{
  expect(ids('all','park-b')).toEqual(['eta','verify']);
  expect(ids('all','park-a')).not.toContain('eta');
  expect(ids('delivery_attention','park-b')).toEqual(['eta']);
  expect(ids('all','unlisted')).toEqual([]);
  expect(ids('all','','  W-PENDING ')).toEqual(['pending']);
  expect(ids('all','','fIx VeRiFy')).toEqual(['verify']);
  expect(ids('all','','PLUMBING')).toEqual(rows.map(x=>x.work.id));
  expect(ids('delivery_attention','park-a','eta')).toEqual([]);
  expect(ids('all','','555-0101')).toEqual([]); // confidential description not searchable
 });
 it('exports exactly the passed visible rows with authorized readable property and correct site',()=>{
  const visible=filterWaitingPartsRows(rows,'delivery_attention','park-b','');
  const exported=waitingPartsCsvRows(visible,properties,sites);
  expect(exported).toHaveLength(2);
  expect(exported[1]).toEqual([
   'W-eta','Fix eta','Park B','Apartment 12','plumbing','normal',
   'Linked delivery missing ETA','2','0','0','0','1',
   'No recorded positive stock','2026-10-31','2026-10-27',
  ]);
  const serialized=csv(exported);
  expect(serialized).not.toContain('Site 88');
  expect(serialized).not.toContain('Confidential');
  expect(serialized).not.toContain('555-0101');
  expect(serialized).not.toContain('private-customer');
  expect(serialized).not.toContain('private-user');
 });
 it('includes only the currently displayed page, not hidden matching rows',()=>{
  const matches=filterWaitingPartsRows(rows,'purchasing_review','','');
  expect(matches).toHaveLength(4);
  const firstTwo=waitingPartsCsvRows(matches.slice(0,2),properties,sites);
  expect(firstTwo).toHaveLength(3);
  const raw=csv(firstTwo);
  expect(raw).toContain('W-purchasing');
  expect(raw).toContain('W-waiting');
  expect(raw).not.toContain('W-urgent-delivery');
  expect(raw).not.toContain('W-no-active');
  expect(waitingPartsCsvRows([],properties,sites)).toHaveLength(1);
 });
 it('uses property-specific site labels and does not trust a same-ID site in a different property',()=>{
  const other=[
   { ...rows[0],work:{...rows[0].work,site_id:'space-unlisted'} },
   rows[7],
  ];
  const exportRows=waitingPartsCsvRows(other,properties,sites);
  expect(exportRows[1][3]).toBe('Property / common area');
  expect(exportRows[2][3]).toBe('Apartment 12');
  expect(exportRows[2][2]).toBe('Park B');
 });
 it('escapes formula-like repair titles using the existing secure CSV writer',()=>{
  const malicious=[{
   ...rows[0],
   work:{...rows[0].work,number:'=HYPERLINK("evil","x")',
    title:'+SUM(1,2)'},
  }];
  const result=csv(waitingPartsCsvRows(malicious,properties,sites));
  expect(result).toContain(`"'=HYPERLINK(""evil"",""x"")"`);
  expect(result).toContain(`"'+SUM(1,2)"`);
  expect(result).not.toContain('private-customer');
 });
 it('never mutates filters, source work records, authorized properties or site list',()=>{
  const snapshot=rows.map(x=>({id:x.work.id,reason:x.reason,title:x.work.title}));
  const propertySnapshot=properties.map(x=>({...x}));
  const siteSnapshot=sites.map(x=>({...x}));
  filterWaitingPartsRows(rows,'all','park-a','Fix');
  waitingPartsCsvRows(rows.slice(0,5),properties,sites);
  expect(rows.map(x=>({id:x.work.id,reason:x.reason,title:x.work.title}))).toEqual(snapshot);
  expect(properties).toEqual(propertySnapshot);
  expect(sites).toEqual(siteSnapshot);
 });
});

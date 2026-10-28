import type {WaitingPartsHandoffRow,WaitingPartsReason} from './waiting-parts-handoff';
import {waitingPartsReasonLabels} from './waiting-parts-handoff';

export type WaitingPartsViewFilter=
 'all'|'no_request'|'awaiting_decision'|'delivery_attention'|
 'purchasing_review'|'verify_parts'|'urgent';

export const waitingPartsFilterChoices:readonly {value:WaitingPartsViewFilter;label:string}[]=[
 {value:'all',label:'All waiting repairs'},
 {value:'no_request',label:'No parts request'},
 {value:'awaiting_decision',label:'Request awaiting decision'},
 {value:'delivery_attention',label:'Delayed or no ETA'},
 {value:'purchasing_review',label:'Other purchasing follow-up'},
 {value:'verify_parts',label:'Check received parts'},
 {value:'urgent',label:'Urgent repairs'},
];

const groups:Record<Exclude<WaitingPartsViewFilter,'all'|'urgent'>,readonly WaitingPartsReason[]>={
 no_request:['no_structured_request'],
 awaiting_decision:['open_request'],
 delivery_attention:['late_linked_delivery','missing_eta'],
 purchasing_review:['purchasing_review','awaiting_linked_delivery','no_active_request'],
 verify_parts:['verify_parts'],
};

/** Inputs have already been generated from authorized property records.
 * Keep that order; filter/search must not change attention priority.
 * No free-text customer details or work notes are searched or exported.
 */
export function filterWaitingPartsRows(
 rows:readonly WaitingPartsHandoffRow[],
 filter:WaitingPartsViewFilter,
 propertyId:string,
 search:string,
):WaitingPartsHandoffRow[]{
 const query=search.trim().toLocaleLowerCase();
 return rows.filter(row=>
  (!propertyId || row.work.property_id===propertyId) &&
  (filter==='all'||(filter==='urgent'
   ?row.work.priority==='urgent':groups[filter].includes(row.reason))) &&
  (!query||[
   row.work.number,row.work.title,row.work.category,
  ].some(value=>value.toLocaleLowerCase().includes(query)))
 );
}

/** Export exactly the selected visible repairs, not hidden/filtered jobs.
 * Organization data, customer names, contact info and free-text notes are
 * intentionally absent; the existing csv() writer escapes spreadsheet
 * formulas before download.
 */
export function waitingPartsCsvRows(
 rows:readonly WaitingPartsHandoffRow[],
 properties:readonly {id:string;name:string}[],
 sites:readonly {id:string;property_id:string;label:string}[],
):string[][]{
 const propertyNames=new Map(properties.map(p=>[p.id,p.name]));
 return [
  ['Work order','Repair title','Property','Space / area','Category','Priority',
   'Attention reason','Linked requests','Awaiting decision','Placed orders outstanding',
   'Late placed orders','Placed orders without ETA','Recorded stock on hand (unreserved)',
   'Repair due date','Property local date'],
  ...rows.map(row=>{
   const work=row.work;
   const site=sites.find(s=>s.id===work.site_id&&s.property_id===work.property_id);
   return [
    work.number,work.title,propertyNames.get(work.property_id)??'Property',
    site?.label??'Property / common area',
    work.category,work.priority,waitingPartsReasonLabels[row.reason],
    String(row.linkedRequestCount),String(row.openRequestCount),
    String(row.outstandingPlacedOrderCount),String(row.lateOrderCount),
    String(row.noEtaOrderCount),row.hasRecordedOnHand?'Yes - not reserved':'No recorded positive stock',
    work.due_on??'',row.propertyToday,
   ];
  }),
 ];
}

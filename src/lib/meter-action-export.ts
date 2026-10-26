import {csv} from './domain';
import type {MonthlyRunRow} from './monthly-billing-run';

export function meterActionCsv(property:string,month:string,rows:MonthlyRunRow[]):string{
 const heading=['Property','Billing month','Site / unit','Utility','Action','Boundary date','Billing period start','Billing period end (exclusive)'];
 const tasks=rows.flatMap(row=>row.checklist.filter(c=>c.state==='check'&&
  (c.label.includes('boundary readings')||c.label.includes('meter readings'))).flatMap(item=>{
  const utility=item.label.split(' ')[0];
  const segments=item.note.split(';').map(v=>v.trim());
  return segments.map(segment=>{
   const matched=/^(opening|closing) reading (\d{4}-\d{2}-\d{2}): (missing capture|requires accepted review)$/.exec(segment);
   return [property,month,row.siteLabel,utility,matched?
    matched[3]==='missing capture'?'Capture reading':'Approve/review reading':'Inspect meter evidence',
    matched?matched[2]:'',row.period.startsOn,row.period.endsOn];
  });
 }));
 return '\uFEFF'+csv([heading,...tasks])+'\r\n';
}

'use client';
import {useEffect,useState} from 'react';
import type {OpsUI} from './types';
type RepairLink={id:string;work_order_id:string};
type Recheck={id:string;inspection_link_id:string;outcome:'verified'|'needs_more_work';notes:string;signed_at:string};
type ReviewRow={id:string;workId:string;runId:string;outcome:'verified'|'needs_more_work'|null;signedAt:string|null;notes:string|null};
export function SupervisorReviewDashboard({ui}:{ui:OpsUI}){
 const [result,setResult]=useState<{state:'loading'|'ready'|'unavailable';rows:ReviewRow[]}>({state:'loading',rows:[]});
 const organization=ui.snapshot.organizationId, property=ui.propertyId;
 const runs=ui.data.runs.filter(run=>run.property_id===property).slice(0,20);
 const runIds=runs.map(run=>run.id).join(',');
 useEffect(()=>{
  const controller=new AbortController();
  const ids=runIds?runIds.split(','):[];
  Promise.all(ids.map(async run=>{
   const query=new URLSearchParams({organization,property,run});
   const [linked,checked]=await Promise.all([
    fetch('/api/inspection-work-links?'+query,{signal:controller.signal,cache:'no-store'}),
    fetch('/api/inspection-rechecks?'+query,{signal:controller.signal,cache:'no-store'}),
   ]);
   if(!linked.ok||!checked.ok)throw Error('Supervisor follow-up records unavailable');
   const links=await linked.json() as {links:RepairLink[]};
   const checks=await checked.json() as {rechecks:Recheck[]};
   return links.links.map(link=>{
    const latest=checks.rechecks.filter(c=>c.inspection_link_id===link.id).sort((a,b)=>b.signed_at.localeCompare(a.signed_at))[0];
    return {id:link.id,workId:link.work_order_id,runId:run,outcome:latest?.outcome??null,
      signedAt:latest?.signed_at??null,notes:latest?.notes??null} satisfies ReviewRow;
   });
  })).then(parts=>{
   if(!controller.signal.aborted)setResult({state:'ready',rows:parts.flat()});
  }).catch(()=>{
   if(!controller.signal.aborted)setResult({state:'unavailable',rows:[]});
  });
  return ()=>controller.abort();
 },[organization,property,runIds]);
 const outstanding=result.rows.filter(row=>{ const w=ui.data.work.find(w=>w.id===row.workId); return !w || (w.property_id===property && !['completed','closed','cancelled'].includes(w.status)); });
 const unassigned=outstanding.filter(row=>{ const w=ui.data.work.find(w=>w.id===row.workId); return w && !w.assigned_to; });
 const completed=result.rows.filter(row=>{
  const work=ui.data.work.find(w=>w.id===row.workId);
  return work&&work.property_id===property&&['completed','closed'].includes(work.status);
 });
 const pending=completed.filter(row=>row.outcome!=='verified');
 const needsWork=completed.filter(row=>row.outcome==='needs_more_work');
 const verified=completed.filter(row=>row.outcome==='verified');
 return <section className="ops-record" aria-label="Supervisor repair follow-up dashboard">
  <h3>Supervisor repair follow-ups</h3>
  <p>Based on saved inspection-to-repair links and the latest reinspection decision for each link. These counts do not certify a site as safe.</p>
  {result.state==='loading'&&<p role="status">Loading supervisor reviews…</p>}
  {result.state==='unavailable'&&<p role="alert">Supervisor review records are unavailable. No verification status can be assumed.</p>}
  {result.state==='ready'&&<>
   <div className="stat-grid">
    <div className="stat-card"><span>Open or unavailable linked repairs</span><strong>{outstanding.length}</strong></div>
    <div className="stat-card"><span>Unassigned linked repairs</span><strong>{unassigned.length}</strong></div>
    <div className="stat-card"><span>Completed repairs awaiting review</span><strong>{pending.length}</strong></div>
    <div className="stat-card"><span>Needs more work</span><strong>{needsWork.length}</strong></div>
    <div className="stat-card"><span>Latest review verified</span><strong>{verified.length}</strong></div>
   </div>
   <details open={outstanding.length>0}>
    <summary>Open linked repair follow-ups ({outstanding.length})</summary>
    {!outstanding.length&&<p>No open linked repairs found in the checked inspection runs.</p>}
    {outstanding.slice(0,30).map(row=>{
     const work=ui.data.work.find(w=>w.id===row.workId && w.property_id===property);
     const employee=ui.data.staff.find(staff=>staff.property_id===property && staff.user_id===work?.assigned_to);
     return <article className="ops-history" key={row.id}>
      <strong>{work?.number??'Unavailable repair'} · {work?.title??'Work order unavailable'}</strong>
      <p>Status: {work?.status.replaceAll('_',' ')??'Unavailable'} · Priority: {work?.priority??'Unknown'} · Assigned to: {employee?.name??(work?.assigned_to?'Assigned employee':'Unassigned')}</p>
      <p>Due: {work?.due_on??'Not set'}</p>
      {work&&<button type="button" className="text-button" onClick={()=>ui.open('work_detail',work.id)}>Open repair work order</button>}
      {' '}
      <button type="button" className="text-button" onClick={()=>ui.open('run_detail',row.runId)}>Open linked inspection</button>
     </article>;
    })}
   </details>
   <details>
    <summary>Review completed linked repairs ({completed.length})</summary>
    {!completed.length&&<p>No completed linked repairs found in the checked inspection runs.</p>}
    {completed.slice(0,30).map(row=>{
     const work=ui.data.work.find(w=>w.id===row.workId);
     return <article className="ops-history" key={row.id}>
      <strong>{work?.number??'Repair'} · {work?.title??'Work order unavailable'}</strong>
      <p>{row.outcome==='verified'?'Latest reinspection: verified':row.outcome==='needs_more_work'?'Latest reinspection: needs more work':'Awaiting supervisor reinspection'}
       {row.signedAt?' · '+row.signedAt.slice(0,10):''}</p>
      {row.notes&&<p>{row.notes}</p>}
      <button type="button" className="text-button" onClick={()=>ui.open('run_detail',row.runId)}>Open inspection to review</button>
     </article>;
    })}
   </details>
   <p className="muted small">Checks at most 20 loaded inspection runs for this property; older links may not appear. Verified means a saved supervisor review, not a legal safety certification.</p>
  </>}
 </section>;
}

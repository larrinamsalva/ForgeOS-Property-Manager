'use client';
import { useEffect, useState } from 'react';
import type { OpsUI } from './types';
type LinkRow={id:string;item_key:string;work_order_id:string;created_at:string;created_by:string};
export function InspectionRepairLinks({ui,runId,items}:{
 ui:OpsUI;runId:string;items:{key:string;label:string}[];
}){
 const [links,setLinks]=useState<LinkRow[]>([]);
 const [message,setMessage]=useState('Loading repair links…');
 const [item,setItem]=useState(items[0]?.key??'');
 const [workId,setWorkId]=useState('');
 const [saving,setSaving]=useState(false);
 const scopedWork=ui.data.work.filter(w=>w.property_id===ui.propertyId);
 const query=new URLSearchParams({organization:ui.snapshot.organizationId,property:ui.propertyId,run:runId});
 async function refresh(signal?:AbortSignal) {
  try {
   const r=await fetch('/api/inspection-work-links?'+query,{signal,cache:'no-store'});
   const data=await r.json();
   if(!r.ok)throw Error(data.error??'Links unavailable');
   if(!signal?.aborted){setLinks(data.links);setMessage('');}
  }catch(e){if(!signal?.aborted)setMessage(e instanceof Error?e.message:'Links unavailable');}
 }
 useEffect(()=>{
  const controller=new AbortController();
  void (async()=>{
   try{
    const r=await fetch('/api/inspection-work-links?'+new URLSearchParams({
     organization:ui.snapshot.organizationId,property:ui.propertyId,run:runId,
    }),{signal:controller.signal,cache:'no-store'});
    const j=await r.json();if(!r.ok)throw Error(j.error??'Links unavailable');
    if(!controller.signal.aborted){setLinks(j.links);setMessage('');}
   }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Links unavailable');}
  })();
  return ()=>controller.abort();
 },[ui.snapshot.organizationId,ui.propertyId,runId]);
 async function save(){
  if(!item||!workId)return;
  setSaving(true);
  try{
   const r=await fetch('/api/inspection-work-links',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({organization_id:ui.snapshot.organizationId,property_id:ui.propertyId,run_id:runId,item_key:item,work_order_id:workId}),
   });
   const j=await r.json();if(!r.ok)throw Error(j.error??'Link failed');
   await refresh();setMessage('Repair link saved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Link failed');}
  finally{setSaving(false);}
 }
 return <section className="ops-record" aria-label="Inspection linked repairs">
  <h3>Linked inspection repairs</h3>
  <p>Link an existing repair to an inspection item. This preserves a real record, but does not create or complete a work order automatically.</p>
  {ui.office&&ui.active&&<div className="meter-controls">
   <label>Inspection item<select value={item} onChange={e=>setItem(e.target.value)}>
    {items.map(i=><option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
   <label>Existing repair<select value={workId} onChange={e=>setWorkId(e.target.value)}>
    <option value="">Choose work order</option>{scopedWork.map(w=><option key={w.id} value={w.id}>{w.number} · {w.title}</option>)}</select></label>
   <button type="button" className="button secondary" disabled={saving||!item||!workId} onClick={save}>Link repair</button>
  </div>}
  {message&&<p role="status">{message}</p>}
  {links.length===0&&!message&&<p>No linked repair records for this inspection.</p>}
  {links.map(link=>{
   const repair=scopedWork.find(w=>w.id===link.work_order_id);
   return <p key={link.id}>
    {items.find(i=>i.key===link.item_key)?.label??link.item_key} ·{' '}
    {repair?<button className="text-button" onClick={()=>ui.open('work_detail',repair.id)}>
     {repair.number} · {repair.title}</button>:'Repair unavailable'}{' '}
    · {repair?.status.replaceAll('_',' ')??'Status unavailable'} · Linked {link.created_at.slice(0,10)}
   </p>;
  })}
  <p>Repairs are still completed through the existing work-order workflow. Links are retained for history.</p>
 </section>;
}

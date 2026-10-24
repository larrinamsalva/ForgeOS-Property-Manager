'use client';
import {useEffect,useState} from 'react';
import type {OpsUI} from './types';
type Location={id:string;site_id:string|null;area_label:string|null;created_at:string;created_by:string};
export function InspectionLocation({ui,runId}:{ui:OpsUI;runId:string}){
 const [saved,setSaved]=useState<Location|null>(null);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [choice,setChoice]=useState('');
 const [area,setArea]=useState('');
 const [busy,setBusy]=useState(false);
 const sites=ui.snapshot.sites.filter(site=>site.property_id===ui.propertyId);
 useEffect(()=>{
  const controller=new AbortController();
  void (async()=>{
   try{
    const params=new URLSearchParams({organization:ui.snapshot.organizationId,property:ui.propertyId,run:runId});
    const response=await fetch('/api/inspection-run-locations?'+params,{cache:'no-store',signal:controller.signal});
    const result=await response.json();
    if(!response.ok)throw Error(result.error??'Could not load location.');
    if(!controller.signal.aborted)setSaved(result.location);
   }catch(err){if(!controller.signal.aborted)setMessage(err instanceof Error?err.message:'Could not load location.');}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return ()=>controller.abort();
 },[ui.snapshot.organizationId,ui.propertyId,runId]);
 async function save(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/inspection-run-locations',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({organization_id:ui.snapshot.organizationId,property_id:ui.propertyId,run_id:runId,
    site_id:choice&&choice!=='common'?choice:null,area_label:choice==='common'?area.trim():null})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error??'Could not save location.');
   setSaved({id:'saved',site_id:choice==='common'?null:choice,area_label:choice==='common'?area.trim():null,created_at:new Date().toISOString(),created_by:ui.snapshot.userId});
   setMessage('Inspection location saved.');
  }catch(err){setMessage(err instanceof Error?err.message:'Could not save location.');}
  finally{setBusy(false);}
 }
 const site=saved?.site_id?sites.find(site=>site.id===saved.site_id):null;
 return <section className="ops-record" aria-label="Inspection location">
  <h3>Inspection location</h3>
  {loading?<p>Loading location…</p>:saved?<p><strong>{site?site.label:saved.site_id?'Site not visible':saved.area_label}</strong> · Recorded {saved.created_at.slice(0,10)}. Location is retained with this inspection.</p>:
   <><p>Assign one permanent site or common area to this inspection run.</p>
   {ui.office&&ui.active?<div className="action-group">
    <label>Site or common area <select value={choice} onChange={e=>setChoice(e.target.value)}>
     <option value="">Choose location</option>
     {sites.map(site=><option value={site.id} key={site.id}>{site.label} · {site.kind}</option>)}
     <option value="common">Common area / facility</option>
    </select></label>
    {choice==='common'&&<label>Area name <input value={area} maxLength={120} onChange={e=>setArea(e.target.value)} placeholder="Laundry room, bathhouse, office…" /></label>}
    <button type="button" disabled={busy||!choice||(choice==='common'&&area.trim().length<2)} onClick={save}>Save inspection location</button>
   </div>:<p>No location is recorded. Ask a manager to assign one.</p>}</>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
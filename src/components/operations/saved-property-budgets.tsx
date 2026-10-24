'use client';
import { useEffect,useState } from 'react';
import { cents } from '@/lib/billing-domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';
type Budget={id:string;budget_month:string;category:string;limit_cents:number;updated_at:string};
type Audit={id:string;budget_month:string;category:string;old_limit_cents:number|null;new_limit_cents:number;recorded_at:string};
export function SavedPropertyBudgets({data,propertyId,organizationId}:{
 data:OperationsSnapshot;propertyId:string;organizationId:string;
}) {
 const [records,setRecords]=useState<Budget[]>([]);
 const [audit,setAudit]=useState<Audit[]>([]);
 const [state,setState]=useState('Loading saved budgets…');
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
 const [category,setCategory]=useState('all');
 const [limit,setLimit]=useState('');
 const [saving,setSaving]=useState(false);
 const categories=[...new Set(data.work.filter(w=>w.property_id===propertyId).map(w=>w.category).filter(Boolean))].sort();
 async function load(signal?:AbortSignal) {
  try {
   const r=await fetch('/api/maintenance-budgets?'+new URLSearchParams({organization:organizationId,property:propertyId}),{cache:'no-store',signal});
   const j=await r.json();
   if(!r.ok) throw Error(j.error??'Budgets unavailable');
   if(!signal?.aborted){setRecords(j.budgets);setAudit(j.audit);setState('');}
  } catch(e){if(!signal?.aborted)setState(e instanceof Error?e.message:'Budget service unavailable');}
 }
 useEffect(()=>{
  const controller=new AbortController();
  void (async()=>{
   try {
    const r=await fetch('/api/maintenance-budgets?'+new URLSearchParams({organization:organizationId,property:propertyId}),{signal:controller.signal,cache:'no-store'});
    const j=await r.json();
    if(!r.ok)throw Error(j.error??'Budgets unavailable');
    if(!controller.signal.aborted){setRecords(j.budgets);setAudit(j.audit);setState('');}
   }catch(e){if(!controller.signal.aborted)setState(e instanceof Error?e.message:'Budgets unavailable');}
  })();
  return ()=>controller.abort();
 },[propertyId,organizationId]);
 async function save() {
  if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(limit)||Number(limit)<=0){setState('Enter a valid positive budget amount.');return;}
  setSaving(true);
  try{
   const [whole,decimal='']=limit.split('.');
   const amount=Number(BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0')));
   const r=await fetch('/api/maintenance-budgets',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({organization_id:organizationId,property_id:propertyId,month,category,limit_cents:amount})});
   const j=await r.json();if(!r.ok)throw Error(j.error??'Could not save budget');
   await load();setState('Budget saved with audit history.');
  }catch(e){setState(e instanceof Error?e.message:'Save failed');}
  finally{setSaving(false);}
 }
 const workIds=new Map(data.work.filter(w=>w.property_id===propertyId).map(w=>[w.id,w.category]));
 return <section className="panel" aria-label="Saved monthly maintenance budgets">
  <h2>Saved property budgets</h2>
  <p>Owner and manager controlled. Figures compare gross recorded maintenance expenses against saved monthly limits; not cash payments or purchase-order commitments.</p>
  <div className="meter-controls">
   <label>Budget month <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   <label>Category <select value={category} onChange={e=>setCategory(e.target.value)}>
    <option value="all">All maintenance</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   <label>Monthly limit (USD) <input type="text" inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="1500.00"/></label>
   <button type="button" className="button" disabled={saving||!month} onClick={save}>Save monthly budget</button>
  </div>
  {state&&<p role="status">{state}</p>}
  {records.filter(r=>r.budget_month.startsWith(month)).map(r=>{
   const expense=data.costs.filter(c=>c.property_id===propertyId&&workIds.has(c.work_order_id)&&c.kind==='expense'&&c.created_at.startsWith(month)&&
    (r.category==='all'||workIds.get(c.work_order_id)===r.category))
    .reduce((n,c)=>n+BigInt(c.amount_cents),0n);
   const pct=r.limit_cents>0?Number(expense*10000n/BigInt(r.limit_cents))/100:0;
   const tier=pct>=100?'100% reached':pct>=90?'90% warning':pct>=75?'75% warning':'Under 75%';
   return <article className="ops-record" key={r.id}><h3>{r.category==='all'?'All maintenance':r.category}</h3>
    <p>{cents(expense)} recorded gross expenses / {cents(r.limit_cents)} saved limit · <strong>{tier}</strong> ({pct.toFixed(1)}%)</p>
    <progress max={100} value={Math.min(100,pct)} aria-label={r.category+' budget usage'} style={{width:'100%'}}/>
   </article>;
  })}
  <details className="ops-record"><summary>Budget change history ({audit.length} recent changes)</summary>
   {audit.map(a=><p key={a.id}>{a.recorded_at.slice(0,10)} · {a.budget_month.slice(0,7)} · {a.category}: {a.old_limit_cents===null?'New budget':cents(a.old_limit_cents)} → {cents(a.new_limit_cents)}</p>)}
  </details>
  <p>Warnings are displayed when the report is opened; they do not automatically send messages or charge accounts.</p>
 </section>;
}

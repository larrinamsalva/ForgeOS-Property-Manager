'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cents } from '@/lib/billing-domain';
import type { Snapshot } from '@/lib/domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';

type Budget = {id:string;budget_month:string;category:string;limit_cents:number};
type Alert = {key:string;propertyName:string;category:string;amount:bigint;limit:bigint;percent:number};
type Status = {key:string;kind:'loading'|'ready'|'unavailable';alerts:Alert[];message?:string};
export function OverviewBudgetAlerts({snapshot,propertyId,href}:{
 snapshot:Snapshot;propertyId:string;href:(target:string,property?:string)=>string;
}) {
 const managerProperties = snapshot.properties.filter(p =>
   !p.archived_at && (!propertyId || p.id===propertyId) && (
    snapshot.organizationMemberships.some(m=>m.organization_id===snapshot.organizationId &&
      m.user_id===snapshot.userId && ['owner','admin'].includes(m.role)) ||
    snapshot.propertyMemberships.some(m=>m.property_id===p.id && m.user_id===snapshot.userId && m.role==='manager')
   ));
 const key=snapshot.organizationId+':'+managerProperties.map(p=>p.id).join(',');
 const [state,setState]=useState<Status>({key:'',kind:'loading',alerts:[]});
 useEffect(()=>{
  if(!managerProperties.length)return;
  const controller=new AbortController();
  void (async()=>{
   try{
    const month=new Date().toISOString().slice(0,7);
    const opsResponse=await fetch('/api/operations?organization='+encodeURIComponent(snapshot.organizationId),{cache:'no-store',signal:controller.signal});
    if(!opsResponse.ok)throw Error('Maintenance expenses unavailable');
    const operations=await opsResponse.json() as OperationsSnapshot;
    const results=await Promise.all(managerProperties.map(async p=>{
     const response=await fetch('/api/maintenance-budgets?'+new URLSearchParams({organization:snapshot.organizationId,property:p.id}),{cache:'no-store',signal:controller.signal});
     if(!response.ok)throw Error('Saved budgets unavailable');
     const payload=await response.json() as {budgets:Budget[]};
     const workCategories=new Map(operations.work.filter(w=>w.property_id===p.id).map(w=>[w.id,w.category]));
     return payload.budgets.filter(b=>b.budget_month.startsWith(month)).map(b=>{
      const amount=operations.costs.filter(c=>c.property_id===p.id && c.kind==='expense' &&
        c.created_at.startsWith(month) && workCategories.has(c.work_order_id) &&
        (b.category==='all'||workCategories.get(c.work_order_id)===b.category))
        .reduce((sum,c)=>sum+BigInt(c.amount_cents),0n);
      const limit=BigInt(b.limit_cents);
      return {key:b.id,propertyName:p.name,category:b.category,amount,limit,percent:limit>0n?Number(amount*10000n/limit)/100:0};
     });
    }));
    if(!controller.signal.aborted)setState({key,kind:'ready',alerts:results.flat().filter(a=>a.percent>=75).sort((a,b)=>b.percent-a.percent)});
   }catch(e){if(!controller.signal.aborted)setState({key,kind:'unavailable',alerts:[],message:e instanceof Error?e.message:'Budget reports unavailable'});}
  })();
  return ()=>controller.abort();
 // Identity is derived from organization and authorized property IDs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 if(!managerProperties.length)return null;
 const active=state.key===key?state:{key,kind:'loading' as const,alerts:[]};
 return <section className="panel" aria-label="Manager budget warnings">
  <div className="panel-heading"><div>
    <h2>Monthly budget warnings</h2>
    <p>Manager-only readout of saved limits and gross recorded maintenance expenses (UTC month). No purchase orders or payment assumptions.</p>
  </div><Link href={href('inventory',managerProperties[0]?.id)}>Review purchasing</Link></div>
  {active.kind==='loading'?<p>Checking saved property budgets…</p>:
   active.kind==='unavailable'?<p role="status">Budget status unavailable — please check Inventory &amp; Purchasing. {active.message}</p>:
   active.alerts.length===0?<p>No saved budgets have crossed 75% in the selected properties. Missing budgets are not counted as zero spending.</p>:
   <div>{active.alerts.map(a=><article className="ops-record" key={a.key}>
     <strong>{a.propertyName} · {a.category==='all'?'All maintenance':a.category}</strong>
     <p>{a.percent>=100?'100% reached':a.percent>=90?'90% warning':'75% warning'} — {a.percent.toFixed(1)}% · {cents(a.amount)} of {cents(a.limit)}</p>
     <progress aria-label={a.propertyName+' budget usage'} max={100} value={Math.min(100,a.percent)} style={{width:'100%'}} />
   </article>)}</div>}
  <p>Alerts appear here when loaded; they do not send texts, emails, or financial transactions.</p>
 </section>;
}

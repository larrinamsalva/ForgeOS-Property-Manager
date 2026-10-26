'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {canEditProperty,type Snapshot} from '@/lib/domain';
import {cents} from '@/lib/billing-domain';
import type {OperationsSnapshot} from '@/lib/operations-domain';
import {maintenanceSpendingTrends} from '@/lib/maintenance-spending-trends';

export function OverviewMaintenanceSpending({snapshot,propertyId,href}:{
 snapshot:Snapshot;propertyId:string;href:(target:string,property?:string)=>string;
}){
 const properties=snapshot.properties.filter(p=>!p.archived_at&&(!propertyId||p.id===propertyId)&&canEditProperty(snapshot,p.id,true));
 const key=snapshot.organizationId+':'+properties.map(p=>p.id).join(',');
 const [state,setState]=useState<{key:string;data?:OperationsSnapshot;error?:boolean}>({key:''});
 useEffect(()=>{
  if(!properties.length)return;
  const controller=new AbortController();
  fetch('/api/operations?organization='+encodeURIComponent(snapshot.organizationId),{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('Unavailable');return r.json() as Promise<OperationsSnapshot>})
   .then(data=>{if(!controller.signal.aborted)setState({key,data});})
   .catch(()=>{if(!controller.signal.aborted)setState({key,error:true});});
  return ()=>controller.abort();
 // Authorized properties are encoded in key.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 if(!properties.length)return null;
 const active=state.key===key?state:null;
 const start=(new Date().getUTCFullYear()-1)+'-01-01';
 const totals=active?.data?maintenanceSpendingTrends(active.data.work,active.data.costs,properties.map(p=>p.id),start):null;
 const propertyName=(id:string)=>properties.find(p=>p.id===id)?.name??'Property';
 const show=(entries:{key:string;amountCents:string}[],type:'month'|'category'|'site')=>
  entries.slice(0,8).map(item=>{
   const [id,value]=item.key.split('|');
   const name=type==='site'?snapshot.sites.find(s=>s.id===value&&s.property_id===id)?.label??'Site':value;
   return <li key={item.key}>{propertyName(id)} · {name}: <strong>{cents(item.amountCents)}</strong></li>;
  });
 return <section className="panel" aria-label="Maintenance expense trends">
  <div className="panel-heading"><div><h2>Maintenance spending trends</h2>
   <p>Recorded direct repair expense entries, excluding estimates and material movements. Not a cash-flow or tax report.</p>
  </div><Link href={href('maintenance',properties[0].id)}>Review maintenance records</Link></div>
  {!active?<p role="status">Loading expense records…</p>:
   active.error?<p role="status">Expense records unavailable; no totals assumed.</p>:
   totals&&<>
    <h3>Monthly expenses</h3>{totals.monthly.length?<ul>{show(totals.monthly,'month')}</ul>:<p>No expense entries found.</p>}
    <h3>Expenses by work category</h3>{totals.categories.length?<ul>{show(totals.categories,'category')}</ul>:<p>No recorded category expenses.</p>}
    <h3>Sites with recorded expenses</h3>{totals.sites.length?<ul>{show(totals.sites,'site')}</ul>:<p>No site-linked expenses.</p>}
   </>}
  <p className="muted small">Showing up to eight highest recorded totals in each list since {start} (UTC entry date). Entries are not necessarily paid invoices; refunds and other adjustments may be recorded separately.</p>
 </section>;
}

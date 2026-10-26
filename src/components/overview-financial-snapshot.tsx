'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { canEditProperty, type Snapshot } from '@/lib/domain';
import { cents } from '@/lib/billing-domain';
import type { CollectionsSnapshot } from '@/lib/collections-domain';
import { propertyFinancialSnapshot } from '@/lib/property-financial-snapshot';

export function OverviewFinancialSnapshot({snapshot,propertyId,href}:{
 snapshot:Snapshot;propertyId:string;href:(target:string,property?:string)=>string;
}) {
 const permitted=snapshot.properties.filter(p=>!p.archived_at &&
  (!propertyId || p.id===propertyId) && canEditProperty(snapshot,p.id,true));
 const key=snapshot.organizationId+':'+permitted.map(p=>p.id).join(',');
 const [loaded,setLoaded]=useState<{key:string;data?:CollectionsSnapshot;error?:boolean}>({key:''});
 useEffect(()=>{
  if(!permitted.length)return;
  const ctrl=new AbortController();
  fetch('/api/collections?organization='+encodeURIComponent(snapshot.organizationId),{
   cache:'no-store',signal:ctrl.signal
  }).then(async r=>{
   if(!r.ok)throw Error('Collections unavailable');
   return r.json() as Promise<CollectionsSnapshot>;
  }).then(data=>{if(!ctrl.signal.aborted)setLoaded({key,data});})
   .catch(()=>{if(!ctrl.signal.aborted)setLoaded({key,error:true});});
  return ()=>ctrl.abort();
 // The authorization scope is represented by key.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 if(!permitted.length)return null;
 const active=loaded.key===key?loaded:null;
 const rows=active?.data?propertyFinancialSnapshot(active.data,permitted.map(p=>p.id)):[];
 return <section className="panel" aria-label="Authorized property financial overview">
  <div className="panel-heading"><div><h2>Property financial overview</h2>
   <p>Issued billing and recorded collection snapshots. Ledger balances—not estimated revenue.</p>
  </div><Link href={href('collections',permitted[0].id)}>Payments &amp; collections</Link></div>
  {!active?<p role="status">Loading financial totals…</p>:
   active.error?<p role="status">Financial totals unavailable. Open Payments &amp; collections to check records.</p>:
   rows.map(row=><article className="ops-record" key={row.propertyId}>
    <h3>{permitted.find(p=>p.id===row.propertyId)?.name ?? 'Property'}</h3>
    <div className="stat-grid">
     <div className="stat-card"><span>Issued invoice face totals</span><strong>{cents(row.issuedCents)}</strong></div>
     <div className="stat-card"><span>Recorded payments (gross)</span><strong>{cents(row.recordedPaymentsCents)}</strong></div>
     <div className="stat-card"><span>Remaining issued balances</span><strong>{cents(row.outstandingCents)}</strong></div>
     <div className="stat-card"><span>Past-due invoice accounts</span><strong>{row.overdueAccounts}</strong></div>
    </div>
    <Link href={href('collections',row.propertyId)}>Review this property's collections</Link>
   </article>)}
  <p className="muted small">Issued totals and gross recorded payments are different measures. Payments may include unapplied funds; reversals, credits, adjustments and refunds affect the ledger balance. These are all-time snapshots, not this month's revenue. No deposits are counted as rent payments.</p>
 </section>;
}

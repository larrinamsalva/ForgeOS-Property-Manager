'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {OperationsSnapshot} from '@/lib/operations-domain';
import type {MeterSnapshot} from '@/lib/meter-domain';
import {meterFileEntries} from '@/lib/meter-file';
import {siteMeterReviewLinks} from '@/lib/site-meter-links';

export function SiteAttentionCenter({organizationId,propertyId,siteId,overdue}:{
  organizationId:string;propertyId:string;siteId:string;overdue:boolean;
}) {
  const key=[organizationId,propertyId,siteId].join(':');
  const [result,setResult]=useState<{key:string; operations?:OperationsSnapshot; meters?:MeterSnapshot; workError?:boolean; meterError?:boolean}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    const load=async <T,>(url:string):Promise<T>=>{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Unavailable');
      return response.json() as Promise<T>;
    };
    const org=encodeURIComponent(organizationId);
    void Promise.allSettled([
      load<OperationsSnapshot>('/api/operations?organization='+org),
      load<MeterSnapshot>('/api/meters?organization='+org),
    ]).then(([work,meters])=>{
      if(controller.signal.aborted)return;
      setResult({key,
        ...(work.status==='fulfilled'?{operations:work.value}:{workError:true}),
        ...(meters.status==='fulfilled'?{meters:meters.value}:{meterError:true}),
      });
    });
    return ()=>controller.abort();
  },[key,organizationId]);
  const current=result?.key===key?result:null;
  const work=current?.operations?.work.filter(item=>item.property_id===propertyId&&item.site_id===siteId)??[];
  const open=work.filter(item=>!['completed','closed','cancelled'].includes(item.status));
  const urgent=open.filter(item=>['urgent','high'].includes(item.priority));
  const readings=current?.meters?meterFileEntries(current.meters,{siteId},50):[];
  const pending=readings.filter(item=>item.reviewStatus==='pending').length;
  const flagged=readings.filter(item=>item.exceptions.length>0).length;
  const link=(section:string)=>'/'+section+'?'+new URLSearchParams({organization:organizationId,property:propertyId});
  const siteMeterReview=siteMeterReviewLinks(organizationId,propertyId,siteId).review;
  return <section className="site-account-review" aria-label="Smart site attention center">
    <h3>Smart site attention center</h3>
    <p className="muted small">Quick review of existing records linked to this space. These alerts do not change maintenance, meter approvals, billing or notices.</p>
    <div className="stat-grid">
      <div className="stat-card"><span>Current resident balance</span><strong>{overdue?'Past-due alert':'No past-due flag'}</strong></div>
      <div className="stat-card"><span>Urgent / high repairs</span><strong>{!current?'Checking':current.workError?'Unavailable':urgent.length}</strong></div>
      <div className="stat-card"><span>Open repairs</span><strong>{!current?'Checking':current.workError?'Unavailable':open.length}</strong></div>
      <div className="stat-card"><span>Meter reviews pending</span><strong>{!current?'Checking':current.meterError?'Unavailable':pending}</strong></div>
      <div className="stat-card"><span>Flagged meter captures</span><strong>{!current?'Checking':current.meterError?'Unavailable':flagged}</strong></div>
    </div>
    <div className="action-group">
      <Link className="button secondary" href={link('maintenance')}>Review repairs</Link>
      <Link className="button secondary" href={siteMeterReview}>Review this site's meter alerts</Link>
      <Link className="button secondary" href={link('collections')}>Review resident billing</Link>
      <Link className="button secondary" href={link('operations')}>Review inspections</Link>
    </div>
    <p className="muted small">Meter counts cover up to 50 recent site captures. Inspection follow-ups remain in Operations; this panel does not claim an inspection is cleared or that a bill is ready.</p>
  </section>;
}

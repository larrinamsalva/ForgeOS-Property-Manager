'use client';
import { useEffect, useState } from 'react';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import type { MeterSnapshot } from '@/lib/meter-domain';
import { meterFileEntries } from '@/lib/meter-file';

export function SiteSafetyHistory({ organizationId, propertyId, siteId }: {
  organizationId: string; propertyId: string; siteId: string;
}) {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [meterData, setMeterData] = useState<MeterSnapshot | null>(null);
  const [meterError, setMeterError] = useState(false);
  const [linkedRuns, setLinkedRuns] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [inspectionError, setInspectionError] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'loading'|'ready'|'unavailable'>('loading');
  const [supervisorReviews, setSupervisorReviews] = useState<Array<{
    id:string; workOrderId:string; outcome:'verified'|'needs_more_work'; notes:string; signedAt:string;
  }>>([]);
  const [historyKind, setHistoryKind] = useState<'all'|'work'|'inspection'|'meter'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [photoView, setPhotoView] = useState<{id:string;url:string;caption:string}|null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState<string|null>(null);
  async function openRepairPhoto(id:string,caption:string) {
    setPhotoError(''); setPhotoLoading(id); setPhotoView(null);
    try {
      const response = await fetch('/api/operations/photo?id='+encodeURIComponent(id), {cache:'no-store'});
      const result = await response.json() as {url?:string;error?:string};
      if (!response.ok || !result.url) throw new Error(result.error ?? 'Photo unavailable');
      setPhotoView({id,url:result.url,caption});
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Photo unavailable');
    } finally { setPhotoLoading(null); }
  }
  useEffect(() => {
    const controller = new AbortController();
    const ends = new Date().toISOString().slice(0,10);
    const starts = new Date(Date.now() - 365 * 86400000).toISOString().slice(0,10);
    fetch('/api/operations?' + new URLSearchParams({organization:organizationId,starts,ends}), {
      signal:controller.signal, cache:'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Operations history unavailable');
      return response.json() as Promise<OperationsSnapshot>;
    }).then(async (result) => {
      if (controller.signal.aborted) return;
      setData(result);
      const runs = result.runs.filter(run => run.property_id === propertyId).slice(0, 25);
      const lookup = await Promise.all(runs.map(async (run) => {
        try {
          const response = await fetch('/api/inspection-run-locations?' + new URLSearchParams({
            organization:organizationId,property:propertyId,run:run.id,
          }), {signal:controller.signal,cache:'no-store'});
          if (!response.ok) throw new Error('Inspection locations unavailable');
          const value = await response.json() as {location:{site_id:string|null}|null};
          return {id:run.id,match:value.location?.site_id===siteId,ok:true};
        } catch {
          return {id:run.id,match:false,ok:false};
        }
      }));
      if (!controller.signal.aborted) {
        setLinkedRuns(lookup.filter(x=>x.match).map(x=>x.id));
        if (lookup.some(x=>!x.ok)) setInspectionError('Some inspection locations could not be loaded.');
        if (result.runs.filter(run=>run.property_id===propertyId).length>25)
          setInspectionError('Showing a limited recent inspection lookup; older inspections may not appear.');
      }
    }).catch((e) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Site history unavailable');
    });
    return () => controller.abort();
  }, [organizationId,propertyId,siteId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/meters?organization=' + encodeURIComponent(organizationId), {
      cache:'no-store', signal:controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Meter records unavailable');
      return response.json() as Promise<MeterSnapshot>;
    }).then(result => {
      if (!controller.signal.aborted) { setMeterData(result); setMeterError(false); }
    }).catch(() => {
      if (!controller.signal.aborted) { setMeterData(null); setMeterError(true); }
    });
    return () => controller.abort();
  }, [organizationId]);
  useEffect(() => {
    if (!linkedRuns.length) return;
    const controller = new AbortController();
    const scope = (run:string) => new URLSearchParams({
      organization:organizationId,property:propertyId,run,
    });
    Promise.all(linkedRuns.map(async run => {
      const [linksResponse,checksResponse] = await Promise.all([
        fetch('/api/inspection-work-links?'+scope(run),{signal:controller.signal,cache:'no-store'}),
        fetch('/api/inspection-rechecks?'+scope(run),{signal:controller.signal,cache:'no-store'}),
      ]);
      if (!linksResponse.ok || !checksResponse.ok) throw Error('Reinspection history unavailable');
      const links = await linksResponse.json() as {links:Array<{id:string;work_order_id:string}>};
      const checks = await checksResponse.json() as {rechecks:Array<{
        id:string;inspection_link_id:string;outcome:'verified'|'needs_more_work';notes:string;signed_at:string;
      }>};
      const workIds = new Map(links.links.map(link=>[link.id,link.work_order_id]));
      return checks.rechecks.flatMap(check => {
        const workOrderId = workIds.get(check.inspection_link_id);
        return workOrderId ? [{id:check.id,workOrderId,outcome:check.outcome,notes:check.notes,signedAt:check.signed_at}] : [];
      });
    })).then(results => {
      if (!controller.signal.aborted) { setSupervisorReviews(results.flat()); setReviewStatus('ready'); }
    }).catch(() => {
      if (!controller.signal.aborted) { setSupervisorReviews([]); setReviewStatus('unavailable'); }
    });
    return () => controller.abort();
  }, [organizationId,propertyId,linkedRuns]);
  const meterEntries = meterData ? meterFileEntries(meterData, {siteId}, 100) : [];
  const orders = (data?.work ?? []).filter(work => work.property_id === propertyId && work.site_id === siteId)
    .sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const inspections = (data?.runs ?? []).filter(run => linkedRuns.includes(run.id))
    .sort((a,b)=>b.scheduled_for.localeCompare(a.scheduled_for));
  const timeline = [
    ...meterEntries.map(reading => ({
      id:'meter:'+reading.id, kind:'meter' as const, day:reading.recordedOn,
      heading:reading.utility+' · '+reading.meterLabel,
      detail:(reading.reviewStatus==='accepted' ? 'Approved' : reading.reviewStatus==='rejected' ? 'Rejected' : 'Awaiting review')+
        ' · '+(reading.effective ?? reading.original ?? 'No register value')+' '+reading.unit,
    })),

    ...orders.map(work => ({
      id:'work:'+work.id, kind:'work' as const, day:work.requested_on,
      heading:work.number+' · '+work.title,
      detail:work.status.replaceAll('_',' ')+' · '+work.priority+' priority',
    })),
    ...inspections.map(run => ({
      id:'inspection:'+run.id, kind:'inspection' as const, day:run.scheduled_for,
      heading:run.label, detail:'Inspection · '+run.status,
    })),
  ].filter(item => (historyKind==='all'||item.kind===historyKind) &&
    (item.heading+' '+item.detail+' '+item.day).toLowerCase().includes(historySearch.trim().toLowerCase()))
    .sort((a,b)=>b.day.localeCompare(a.day));
  return <section className="site-account-review" aria-label="Site maintenance and inspection history">
    <h3>Site maintenance &amp; inspection history</h3>
    <p className="muted small">Recent authorized property records. Photos are saved privately with their work orders. Authorized users can open a photo on demand.</p>
    {error && <p role="alert">{error}. Open Maintenance to review work records.</p>}
    {!data && !error && <p role="status">Loading site history…</p>}
    {data && <>
      <div className="ops-record" aria-label="Site activity timeline">
        <h4>Site activity timeline</h4>
        <p className="muted small">Combines site work orders, explicitly located inspections, and dated meter readings captured at this site. Meter entries show register values and review status, not resident names, charges or private billing records.</p>
        <div className="action-group">
          <label>Activity type
            <select value={historyKind} onChange={e=>setHistoryKind(e.target.value as typeof historyKind)}>
              <option value="all">All site activity</option>
              <option value="work">Maintenance</option>
              <option value="inspection">Inspections</option>
              <option value="meter">Meter readings</option>
            </select>
          </label>
          <label>Find activity
            <input type="search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}
              placeholder="Search date, status or description" />
          </label>
        </div>
        {meterError && <p role="status">Meter history unavailable. The timeline may be incomplete; use the Meter reader to verify records.</p>}
        {!meterData && !meterError && <p role="status">Loading meter history…</p>}
        {!timeline.length && <p>No site activity matches this filter in the retrieved records.</p>}
        {timeline.slice(0,40).map(item=><article className="ops-history" key={item.id}>
          <strong>{item.day} · {item.kind==='work'?'Maintenance':item.kind==='meter'?'Meter reading':'Inspection'}</strong>
          <p>{item.heading} · {item.detail}</p>
        </article>)}
        {timeline.length>40 && <p>Showing 40 matching activities. Narrow the search to find older records.</p>}
      </div>
      <h4>Work orders ({orders.length})</h4>
      {reviewStatus==='unavailable'&&<p role="status">Supervisor reinspection records could not be loaded. No approval is implied.</p>}
      {reviewStatus==='loading'&&linkedRuns.length>0&&<p role="status">Loading supervisor reinspections…</p>}
      {!orders.length && <p>No work orders found for this space in the retrieved history.</p>}
      {orders.slice(0,30).map(work => {
        const photos = data.photos.filter(photo=>photo.work_order_id===work.id && photo.status==='uploaded');
        return <article className="ops-record" key={work.id}>
          <strong>{work.number} · {work.title}</strong>
          <p>{work.status.replaceAll('_',' ')} · {work.priority} priority · Opened {work.requested_on}</p>
          <p>{photos.length} private photo{photos.length===1?'':'s'} · {data.events.filter(event=>event.work_order_id===work.id).length} history event(s)</p>
          {supervisorReviews.filter(review=>review.workOrderId===work.id).sort((a,b)=>b.signedAt.localeCompare(a.signedAt)).map(review=>
            <p key={review.id}>Supervisor reinspection · {review.signedAt.slice(0,10)} ·
              {review.outcome==='verified'?' Verified':' Needs more work'} · {review.notes}</p>
          )}
          {photos.length>0 && <details>
            <summary>Review repair photos ({photos.length})</summary>
            <p className="muted small">Photos remain in private storage and are opened only through the existing authorized photo service.</p>
            {photos.map(photo=><div key={photo.id} className="action-group">
              <button type="button" className="text-button" disabled={photoLoading!==null}
                onClick={()=>void openRepairPhoto(photo.id,photo.caption)}>
                View {photo.kind} photo{photo.caption?' · '+photo.caption:''}
              </button>
            </div>)}
          </details>}
        </article>;
      })}
      {orders.length>30 && <p>Showing 30 most recent work orders. Open Maintenance for more history.</p>}
      {photoError && <p role="alert">{photoError}</p>}
      {photoView && <section className="ops-record" aria-label="Private repair photograph">
        <h4>Repair photo · {photoView.caption || 'No caption'}</h4>
        {/* The authorized endpoint issues the temporary URL only on demand. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoView.url} alt={photoView.caption || 'Saved repair photograph'}
          style={{maxWidth:'100%',height:'auto'}} referrerPolicy="no-referrer" />
        <div className="action-group"><button type="button" className="button secondary"
          onClick={()=>setPhotoView(null)}>Close photo</button></div>
      </section>}
      <h4>Located inspection runs ({inspections.length})</h4>
      {inspectionError && <p role="status">{inspectionError}</p>}
      {!inspections.length && <p>No linked inspections found in the checked period. Unlocated checklist runs are not attributed to this space.</p>}
      {inspections.map(run=><article className="ops-record" key={run.id}>
        <strong>{run.label}</strong><p>{run.scheduled_for} · {run.status}</p>
        <p>{run.items.filter(item=>data.entries.some(entry=>entry.run_id===run.id&&entry.item_key===item.key&&entry.status==='skipped')).length} items with saved skipped/follow-up entries</p>
      </article>)}
      <p className="muted small">This list does not establish that repairs are verified or safety hazards resolved. For full inspection findings, rechecks and private photos, review Operations and Maintenance.</p>
    </>}
  </section>;
}

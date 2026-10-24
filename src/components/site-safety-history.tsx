'use client';
import { useEffect, useState } from 'react';
import type { OperationsSnapshot } from '@/lib/operations-domain';

export function SiteSafetyHistory({ organizationId, propertyId, siteId }: {
  organizationId: string; propertyId: string; siteId: string;
}) {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [linkedRuns, setLinkedRuns] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [inspectionError, setInspectionError] = useState('');
  const [historyKind, setHistoryKind] = useState<'all'|'work'|'inspection'>('all');
  const [historySearch, setHistorySearch] = useState('');
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
  const orders = (data?.work ?? []).filter(work => work.property_id === propertyId && work.site_id === siteId)
    .sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const inspections = (data?.runs ?? []).filter(run => linkedRuns.includes(run.id))
    .sort((a,b)=>b.scheduled_for.localeCompare(a.scheduled_for));
  const timeline = [
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
    <p className="muted small">Recent authorized property records. Photos are saved privately with their work orders; only photo counts are shown here.</p>
    {error && <p role="alert">{error}. Open Maintenance to review work records.</p>}
    {!data && !error && <p role="status">Loading site history…</p>}
    {data && <>
      <div className="ops-record" aria-label="Site activity timeline">
        <h4>Site activity timeline</h4>
        <p className="muted small">Combines the available site work orders and explicitly located inspections. Occupancy, meter billing and private resident account activity remain in their separate authorized records.</p>
        <div className="action-group">
          <label>Activity type
            <select value={historyKind} onChange={e=>setHistoryKind(e.target.value as typeof historyKind)}>
              <option value="all">All site activity</option>
              <option value="work">Maintenance</option>
              <option value="inspection">Inspections</option>
            </select>
          </label>
          <label>Find activity
            <input type="search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}
              placeholder="Search date, status or description" />
          </label>
        </div>
        {!timeline.length && <p>No site activity matches this filter in the retrieved records.</p>}
        {timeline.slice(0,40).map(item=><article className="ops-history" key={item.id}>
          <strong>{item.day} · {item.kind==='work'?'Maintenance':'Inspection'}</strong>
          <p>{item.heading} · {item.detail}</p>
        </article>)}
        {timeline.length>40 && <p>Showing 40 matching activities. Narrow the search to find older records.</p>}
      </div>
      <h4>Work orders ({orders.length})</h4>
      {!orders.length && <p>No work orders found for this space in the retrieved history.</p>}
      {orders.slice(0,30).map(work => {
        const photos = data.photos.filter(photo=>photo.work_order_id===work.id && photo.status==='uploaded');
        return <article className="ops-record" key={work.id}>
          <strong>{work.number} · {work.title}</strong>
          <p>{work.status.replaceAll('_',' ')} · {work.priority} priority · Opened {work.requested_on}</p>
          <p>{photos.length} private photo{photos.length===1?'':'s'} · {data.events.filter(event=>event.work_order_id===work.id).length} history event(s)</p>
        </article>;
      })}
      {orders.length>30 && <p>Showing 30 most recent work orders. Open Maintenance for more history.</p>}
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

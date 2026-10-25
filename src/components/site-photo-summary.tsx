'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type SiteFile = { id: string; title: string; category: string; mime: string; created_at: string; status: 'uploaded' | 'deleting' };
const vehicles = new Set(['rv','car','motorcycle','boat','offroad']);
export function SitePhotoSummary({ organizationId, propertyId, siteId }: {
  organizationId: string; propertyId: string; siteId: string;
}) {
  const key = organizationId + ':' + propertyId + ':' + siteId;
  const [loaded,setLoaded] = useState<{key:string; files?:SiteFile[]; error?:string}|null>(null);
  const [opened,setOpened] = useState<{id:string;url:string;title:string}|null>(null);
  const [opening,setOpening] = useState<string|null>(null);
  const [viewError,setViewError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({organization:organizationId, property:propertyId,kind:'site',target:siteId});
    fetch('/api/attachments?' + params,{cache:'no-store',signal:controller.signal})
      .then(async r => { if(!r.ok) throw Error('Site photo records unavailable.'); return r.json() as Promise<{files:SiteFile[]}>; })
      .then(data => { if(!controller.signal.aborted) setLoaded({key,files:data.files??[]}); })
      .catch(() => { if(!controller.signal.aborted) setLoaded({key,error:'Site photo records unavailable.'}); });
    return () => controller.abort();
  },[key,organizationId,propertyId,siteId]);
  const current = loaded?.key===key ? loaded : null;
  const files = current?.files ?? [];
  const photos = files.filter(file => file.mime.startsWith('image/'));
  const available = photos.filter(file => file.status==='uploaded');
  const recent = available.slice(0,6);
  async function openPhoto(file:SiteFile) {
    setOpening(file.id);setViewError('');setOpened(null);
    try {
      const response=await fetch('/api/attachments?'+new URLSearchParams({file:file.id}),{cache:'no-store'});
      if(!response.ok)throw Error('Private photograph unavailable.');
      const data=await response.json() as {url:string};
      setOpened({id:file.id,url:data.url,title:file.title});
    }catch{setViewError('Unable to open private photograph. Check access and try again.');}
    finally{setOpening(null);}
  }
  return <section className="site-account-review" aria-label="Site photo dashboard">
    <h3>Site photographs &amp; vehicle records</h3>
    {!current && <p role="status">Loading private site photo history…</p>}
    {current?.error && <p role="alert">{current.error} Open Paperless photos &amp; files to review.</p>}
    {current?.files && <>
      <div className="stat-grid">
        <div className="stat-card"><span>Site photos</span><strong>{available.length}</strong></div>
        <div className="stat-card"><span>Vehicle photos</span><strong>{available.filter(file => vehicles.has(file.category)).length}</strong></div>
        <div className="stat-card"><span>Inspection photos</span><strong>{available.filter(file => file.category==='inspection').length}</strong></div>
        <div className="stat-card"><span>Other files / pending deletion</span><strong>{files.length-available.length}</strong></div>
      </div>
      {recent.length ? <div className="ops-record">
        <h4>Recent site photographs</h4>
        {recent.map(file=><div className="ops-history" key={file.id}>
          <strong>{file.title}</strong> · {file.category} · {new Date(file.created_at).toLocaleDateString()}
          <button type="button" className="button secondary" disabled={opening!==null} onClick={()=>void openPhoto(file)}>View privately</button>
        </div>)}
        {available.length>6 && <p className="muted small">Showing 6 newest saved images. See Paperless files for the full site history.</p>}
      </div> : <p>No uploaded photographs are linked to this site yet.</p>}
    </>}
    {viewError && <p role="alert">{viewError}</p>}
    {opened && <div className="ops-photo-view">
      <p>Private photo access expires after 60 seconds.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="meter-evidence" src={opened.url} alt={opened.title} referrerPolicy="no-referrer"/>
      <button type="button" className="button secondary" onClick={()=>setOpened(null)}>Hide photograph</button>
    </div>}
    <Link className="button secondary" href={'/paperless?'+new URLSearchParams({organization:organizationId,property:propertyId})}>Add or review site photographs</Link>
    <p className="muted small">Only records attached to this site are displayed. Customer-only photos stay within their separate customer file. Private images are never published.</p>
  </section>;
}

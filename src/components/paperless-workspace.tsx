'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera, FileText, FolderOpen, ImagePlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { canEditProperty, type Snapshot } from '@/lib/domain';
import './paperless-workspace.css';

type StoredFile = {
  id: string; customer_id: string | null; site_id: string | null;
  category: string; title: string; mime: string; byte_size: number;
  created_at: string; created_by: string;
};
const categories = [
  ['space','Space / apartment'],['car','Car / truck'],['rv','RV / motorhome / trailer'],
  ['motorcycle','Motorcycle'],['offroad','Off-road / ATV / UTV'],['boat','Boat / watercraft'],
  ['inspection','Inspection / condition'],['document','Scanned document / paperwork'],['other','Other'],
] as const;

export function PaperlessWorkspace({ snapshot, propertyId }: {snapshot: Snapshot;propertyId: string}) {
  const editable = snapshot.properties.filter((p) => !p.archived_at && p.operating_status === 'active' && canEditProperty(snapshot,p.id,true));
  const [selectedProperty,setSelectedProperty] = useState(editable.some((p)=>p.id===propertyId) ? propertyId : (editable[0]?.id??''));
  const [customerId,setCustomerId] = useState('');
  const [siteId,setSiteId] = useState('');
  const [category,setCategory] = useState('space');
  const [title,setTitle] = useState('');
  const [filter,setFilter] = useState<'customer'|'site'>('customer');
  const [files,setFiles] = useState<StoredFile[]>([]);
  const [loading,setLoading] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [opened,setOpened] = useState<{id:string;url:string;mime:string}|null>(null);
  const [refresh,setRefresh] = useState(0);
  const customers = snapshot.customers.filter((c) => c.property_id===selectedProperty && !c.archived_at);
  const sites = snapshot.sites.filter((s) => s.property_id===selectedProperty && !s.archived_at);
  const chosen = filter === 'customer' ? customerId : siteId;

  useEffect(() => {
    if (!selectedProperty || !chosen) return;
    const controller = new AbortController();
    let active = true;
    fetch('/api/attachments?' + new URLSearchParams({
      organization:snapshot.organizationId,property:selectedProperty,kind:filter,target:chosen,
    }),{cache:'no-store',signal:controller.signal}).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error??'Files could not be loaded.');
      if (active) { setFiles(data.files??[]);setError(''); }
    }).catch((err) => { if (active && err.name!=='AbortError') setError(err.message); })
      .finally(()=> {if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[snapshot.organizationId,selectedProperty,chosen,filter,refresh]);
  function changeProperty(value:string) {
    setSelectedProperty(value);setCustomerId('');setSiteId('');setFiles([]);setOpened(null);setNotice('');setError('');
  }
  function changeFilter(value:'customer'|'site') {
    setFilter(value);setFiles([]);setOpened(null);setNotice('');setError('');
  }
  async function upload(event:ChangeEvent<HTMLInputElement>) {
    const items=Array.from(event.target.files??[]);
    event.target.value='';
    if(!items.length)return;
    if(!selectedProperty || (!customerId && !siteId)) {
      setError('Choose a customer and/or space before taking a picture.');return;
    }
    if(!navigator.onLine){setError('No internet connection. This upload was not saved; keep the original photo and retry when online.');return;}
    setUploading(true);setError('');setNotice('');
    try {
      for(const file of items){
        if(file.size>5*1024*1024 || file.size<1)throw Error('Each photo or document must be under 5 MB.');
        if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))
          throw Error('Use JPG, PNG, WebP, or PDF. Convert HEIC photos before uploading.');
        const response=await fetch('/api/attachments',{
          method:'POST',
          headers:{
            'content-type':file.type,
            'x-forgeos-organization':snapshot.organizationId,
            'x-forgeos-property':selectedProperty,
            'x-forgeos-customer':customerId,
            'x-forgeos-site':siteId,
            'x-forgeos-category':category,
            'x-forgeos-title':(title.trim() || file.name).slice(0,160),
          },
          body:file,
        });
        const result=await response.json();
        if(!response.ok)throw Error(result.error??'File could not be saved.');
      }
      setNotice(items.length===1
        ? 'Saved securely to the selected customer/space file.'
        : items.length+' files saved securely to the selected customer/space file.');
      setRefresh((n)=>n+1);
    }catch(err){setError(err instanceof Error?err.message:'Upload failed. Keep the photo and retry.');}
    finally{setUploading(false);}
  }
  async function viewFile(id:string) {
    setError('');setOpened(null);
    try {
      const r=await fetch('/api/attachments?'+new URLSearchParams({file:id}),{cache:'no-store'});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error??'Access denied.');
      setOpened({id,url:data.url,mime:data.mime});
    }catch(e){setError(e instanceof Error?e.message:'File unavailable.');}
  }

  if(!editable.length)return <section className="panel"><div className="panel-content">
    <h2>Paperless customer &amp; property files</h2>
    <p>Sign in as an owner, manager or authorized office worker on an active property to use private record files. This section does not expose resident photos to guests.</p>
  </div></section>;
  return <div className="paperless-workspace">
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PAPERLESS OPERATIONS</span><h2><Camera size={22}/> Take it. Attach it. Filed.</h2></div><ShieldCheck size={24}/></div>
      <div className="panel-content">
        <p>Select the customer or space first, then use your phone or tablet camera. Once you take the picture, ForgeOS uploads it directly to the selected record over the internet. Photos are private and visible only to authorized staff.</p>
        <div className="paperless-grid">
          <label>Property
            <select aria-label="Paperless property" value={selectedProperty} onChange={(e)=>changeProperty(e.target.value)}>
              {editable.map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Customer / person file (optional)
            <select aria-label="Attach to customer" value={customerId} onChange={(e)=>{setCustomerId(e.target.value);setOpened(null);setFiles([]);}}>
              <option value="">No customer selected</option>
              {customers.map((c)=><option value={c.id} key={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </label>
          <label>Site / apartment file (optional)
            <select aria-label="Attach to space" value={siteId} onChange={(e)=>{setSiteId(e.target.value);setOpened(null);setFiles([]);}}>
              <option value="">No space selected</option>
              {sites.map((s)=><option value={s.id} key={s.id}>{s.label} ({s.kind})</option>)}
            </select>
          </label>
          <label>Photo / paperwork category
            <select aria-label="File category" value={category} onChange={(e)=>setCategory(e.target.value)}>
              {categories.map(([value,label])=><option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="paperless-wide">File label / notes (optional)
            <input aria-label="File description" maxLength={160} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Example: arrival inspection, RV front, signed checklist"/>
          </label>
        </div>
        <div className="paperless-actions">
          <label className={'button primary '+(uploading||(!siteId&&!customerId)?'paperless-disabled':'')} htmlFor="paperless-camera">
            <Camera size={18}/> Take photo &amp; auto-file
          </label>
          <input id="paperless-camera" className="sr-only" type="file" aria-label="Camera photo capture" accept="image/jpeg,image/png,image/webp" capture="environment"
            onChange={upload} disabled={uploading||(!siteId&&!customerId)}/>
          <label className={'button secondary '+(uploading||(!siteId&&!customerId)?'paperless-disabled':'')} htmlFor="paperless-files">
            <ImagePlus size={18}/> Choose photo or PDF
          </label>
          <input id="paperless-files" className="sr-only" type="file" aria-label="Choose paperless photos or PDFs"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" multiple onChange={upload} disabled={uploading||(!siteId&&!customerId)}/>
        </div>
        <p className="muted small">Maximum 5 MB per file. You need a working internet connection. ForgeOS does not claim offline auto-sync for customer documents yet. Camera support depends on your mobile browser.</p>
        {uploading && <p className="notice" role="status">Saving the photo securely to the selected record…</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PRIVATE FILING CABINET</span><h2><FolderOpen size={22}/> Saved photos &amp; documents</h2></div>
        <button type="button" className="button secondary" disabled={loading||!chosen} onClick={()=>{setOpened(null);setLoading(true);setRefresh((n)=>n+1);}}><RefreshCw size={16}/> Refresh</button></div>
      <div className="panel-content">
        <div className="paperless-toggle" role="group" aria-label="View files for">
          <button type="button" className={filter==='customer'?'button primary':'button secondary'} onClick={()=>changeFilter('customer')}>Customer files</button>
          <button type="button" className={filter==='site'?'button primary':'button secondary'} onClick={()=>changeFilter('site')}>Space files</button>
        </div>
        {!chosen ? <p className="muted">Choose a {filter==='customer'?'customer':'space'} above to see their private files.</p> :
          <p className="muted small">Showing up to 100 newest files for the selected {filter==='customer'?'customer':'space'}. Use the customer and space selectors to switch files.</p>}
        {chosen && !files.length && <p className="muted">{loading ? 'Loading private files…' : 'No saved files found for this record.'}</p>}
        {files.length>0 && <div className="paperless-file-list">
          {files.map((f)=><article key={f.id}>
            <span className="paperless-file-icon"><FileText size={20}/></span>
            <div><strong>{f.title}</strong><small>{categories.find(([key])=>key===f.category)?.[1]??f.category} · {new Date(f.created_at).toLocaleDateString()} · {(f.byte_size/1024).toFixed(0)} KB</small></div>
            <button type="button" className="button secondary" onClick={()=>viewFile(f.id)}>View privately</button>
          </article>)}
        </div>}
        {opened && <div className="paperless-opened">
          <p>Private file access is available for 60 seconds. Open it to view or save a copy.</p>
          <a href={opened.url} target="_blank" rel="noopener noreferrer" className="button primary">Open protected file</a>
        </div>}
      </div>
    </section>
  </div>;
}

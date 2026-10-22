'use client';

import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';
import { Download, FileImage, FileText, MapPinned, Plus, UploadCloud } from 'lucide-react';

export type DemoSite = { id: string; status: 'occupied' | 'available' | 'reserved'; resident: string; rent: number };
type Marker = { siteId: string; x: number; y: number };
type LocalLayout = { url: string; name: string; type: 'image' | 'pdf' };
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ACCEPTED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function downloadLocalFile(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function quoteCsv(v: string) { return '"' + v.replaceAll('"', '""') + '"'; }

export function GuestPropertyPlanner({
  sites,
  target,
  onTargetChange,
  onAddSites,
}: {
  sites: DemoSite[];
  target: number;
  onTargetChange: (value: number) => void;
  onAddSites: (count: number) => void;
}) {
  const [batch, setBatch] = useState(1);
  const [layout, setLayout] = useState<LocalLayout | null>(null);
  const [selected, setSelected] = useState('');
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [message, setMessage] = useState('');
  const placed = markers.filter((m) => sites.some((s) => s.id === m.siteId));
  const effectiveSite = sites.some((s) => s.id === selected) ? selected : sites[0]?.id ?? '';
  useEffect(() => () => { if (layout) URL.revokeObjectURL(layout.url); }, [layout]);

  function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const type = ACCEPTED_IMAGES.has(file.type) ? 'image' : file.type === 'application/pdf' ? 'pdf' : null;
    if (!type || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      setMessage('Choose a PNG, JPG, WebP or PDF file up to 12 MB. SVG and other files are not supported.');
      return;
    }
    const url = URL.createObjectURL(file);
    setLayout({ url, name: file.name, type });
    setMarkers([]);
    setMessage('Layout opened locally. It is not uploaded or saved to a server.');
  }

  function placeMarker(event: MouseEvent<HTMLButtonElement>) {
    if (!effectiveSite) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    setMarkers((current) => [...current.filter((m) => m.siteId !== effectiveSite), { siteId: effectiveSite, x, y }]);
    setMessage('Placed ' + effectiveSite + ' on the sample plan. Select another site to continue.');
  }

  function exportCsv() {
    const lookup = new Map(placed.map((p) => [p.siteId, p]));
    const lines = [
      ['Site ID', 'Sample status', 'Rent USD / month', 'Plan X percent', 'Plan Y percent'].map(quoteCsv).join(','),
      ...sites.map((site) => {
        const marker = lookup.get(site.id);
        return [site.id, site.status, String(site.rent), marker?.x.toFixed(2) ?? '', marker?.y.toFixed(2) ?? ''].map(quoteCsv).join(',');
      }),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadLocalFile(url, 'forgeos-example-site-plan.csv');
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAnnotatedImage() {
    const original = document.querySelector<HTMLImageElement>('#demo-uploaded-layout');
    if (!original?.complete || !original.naturalWidth || !original.naturalHeight) {
      setMessage('The layout image is still loading. Try downloading it again.');
      return;
    }
    const scale = Math.min(1, 2400 / Math.max(original.naturalWidth, original.naturalHeight));
    const width = Math.floor(original.naturalWidth * scale);
    const height = Math.floor(original.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setMessage('Could not create the numbered image on this device.'); return; }
    ctx.drawImage(original, 0, 0, width, height);
    const radius = Math.max(12, Math.min(width, height) / 38);
    const fontSize = Math.max(10, Math.floor(radius / 1.2));
    ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    placed.forEach(({ siteId, x, y }) => {
      const px = (x / 100) * width, py = (y / 100) * height;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#245edb'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(siteId.replace(/^RV-/, ''), px, py, radius * 1.75);
    });
    canvas.toBlob((blob) => {
      if (!blob) { setMessage('Could not download the annotated layout.'); return; }
      const url = URL.createObjectURL(blob);
      downloadLocalFile(url, 'forgeos-numbered-property-layout.png');
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  return (
    <div className="demo-planner">
      <section className="demo-panel">
        <div className="demo-section-head"><div>
          <h2><MapPinned size={19}/> Plan your property capacity</h2>
          <p>700 is an example planning target, not a limit. Add only the spaces you need as your property grows.</p>
        </div></div>
        <div className="demo-capacity-grid">
          <div><strong>{sites.length.toLocaleString()}</strong><span>Spaces created</span></div>
          <div><strong>{target.toLocaleString()}</strong><span>Planned capacity</span></div>
          <div><strong>{Math.max(0, target - sites.length).toLocaleString()}</strong><span>Not added yet</span></div>
        </div>
        <div className="demo-planner-controls">
          <label htmlFor="demo-planned-capacity">Planned number of RV spaces or units
            <input id="demo-planned-capacity" type="number" min="1" max="999999" step="1" value={target} onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isSafeInteger(n) && n >= 1 && n <= 999999) onTargetChange(n);
            }}/>
          </label>
          <label htmlFor="demo-batch-size">Spaces to add now (1–250 per batch)
            <input id="demo-batch-size" type="number" min="1" max="250" step="1" value={batch} onChange={(e) => setBatch(Number(e.target.value))}/>
          </label>
          <button type="button" className="demo-action" onClick={() => {
            if (!Number.isSafeInteger(batch) || batch < 1 || batch > 250) { setMessage('Enter a whole number between 1 and 250. You can repeat as many batches as needed.'); return; }
            onAddSites(batch);
            setMessage(batch + ' example space' + (batch === 1 ? '' : 's') + ' added. No real property records were changed.');
          }}><Plus size={16}/> Add spaces</button>
        </div>
        <p className="demo-caption">For example, add 100 spaces now, then add more later. Planned spaces are not automatically customers—add people as they arrive. No 700-record ceiling is imposed.</p>
      </section>

      <section className="demo-panel">
        <div className="demo-section-head"><div>
          <h2><UploadCloud size={20}/> Upload your property layout</h2>
          <p>Bring a map, site plan, campground diagram, or aerial picture. Mark numbered spaces on images to help count and organize them.</p>
        </div></div>
        <label className="demo-upload-field" htmlFor="demo-layout-file">
          <FileImage size={22}/>
          <span><strong>Choose a layout image or PDF</strong><small>JPG, PNG, WebP, PDF • Up to 12 MB • Device only</small></span>
        </label>
        <input id="demo-layout-file" className="sr-only" aria-label="Upload property layout" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={uploadFile}/>
        {message && <p className="demo-notice" role="status">{message}</p>}
        {layout && (
          <>
            <div className="demo-layout-file"><span>{layout.type === 'pdf' ? <FileText size={18}/> : <FileImage size={18}/>} <strong>{layout.name}</strong></span>
              <button type="button" onClick={() => downloadLocalFile(layout.url, layout.name)}><Download size={15}/> Download original</button>
            </div>
            {layout.type === 'image' ? (
              <>
                <div className="demo-planner-controls">
                  <label htmlFor="demo-mark-site">Choose a site number to place
                    <select id="demo-mark-site" value={effectiveSite} onChange={(e) => setSelected(e.target.value)}>
                      {sites.map((site) => <option key={site.id} value={site.id}>{site.id}</option>)}
                    </select>
                  </label>
                  <div className="demo-mark-controls"><strong>{placed.length} numbered spots</strong><button type="button" onClick={() => {setMarkers((old) => old.filter((m) => m.siteId !== effectiveSite)); setMessage('Removed ' + effectiveSite + ' from the plan.');}}>Remove selected marker</button></div>
                </div>
                <p className="demo-caption">Select a site above, then tap its location on your image. Tap again to move its marker. The labels are for counting/planning, not automatic image recognition.</p>
                <button className="demo-layout-canvas" type="button" onClick={placeMarker} aria-label={'Place site ' + effectiveSite + ' on uploaded layout'}>
                  {/* Local browser-only image object URL. Next image optimization cannot process blob URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img id="demo-uploaded-layout" src={layout.url} alt="Uploaded property plan to mark numbered spaces"/>
                  {placed.map((mark) => <span key={mark.siteId} className="demo-layout-pin" style={{left: mark.x + '%', top: mark.y + '%'}}>{mark.siteId.replace(/^RV-/, '')}</span>)}
                </button>
                <button className="demo-action" type="button" onClick={exportAnnotatedImage}><Download size={16}/> Download numbered layout image</button>
              </>
            ) : (
              <p className="demo-caption">PDF is kept on this device. You can download the original PDF above. For interactive pin placement, upload an image or screenshot of the plan instead.</p>
            )}
          </>
        )}
        <div className="demo-planner-footer"><div><strong>{placed.length} mapped / {sites.length} added sites</strong><p>Download a spreadsheet-compatible list with the space IDs and positions you marked.</p></div>
          <button type="button" onClick={exportCsv}><Download size={16}/> Download site list (CSV)</button>
        </div>
        <p className="demo-caption">This public sample never uploads or stores the plan. Refreshing the page removes the file and markers. A secure saved layout for real owners will be a separate authenticated feature.</p>
      </section>
    </div>
  );
}

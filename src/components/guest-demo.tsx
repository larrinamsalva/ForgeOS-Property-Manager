'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import { GuestPropertyPlanner } from '@/components/guest-property-planner';
import {
  ArrowRight, Boxes, Building2, CalendarDays, CheckCircle2, ClipboardList,
  Flame, Gauge, Home, LayoutDashboard, LockKeyhole, MapPinned, Receipt,
  RotateCcw, ShieldCheck, Users, Wrench, UploadCloud,
} from 'lucide-react';

type Tab = 'overview' | 'sites' | 'layout' | 'tenants' | 'meters' | 'billing' | 'maintenance' | 'inventory' | 'resident';
type Status = 'occupied' | 'available' | 'reserved';
type Site = { id: string; status: Status; resident: string; rent: number };
type Job = { id: number; title: string; location: string; status: 'Open' | 'Done' };
type Stock = { name: string; quantity: number; unit: string };
type Reading = { site: string; value: number; usage: number };
type DemoCustomer = { id: number; name: string; siteId: string | null };

const menu = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sites', label: 'Sites & map', icon: MapPinned },
  { id: 'layout', label: 'Property layout', icon: UploadCloud },
  { id: 'tenants', label: 'Customers', icon: Users },
  { id: 'meters', label: 'Meter readings', icon: Gauge },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'resident', label: 'Resident view', icon: Home },
] as const;

const initialSites = (): Site[] =>
  Array.from({ length: 20 }, (_, i) => ({
    id: 'RV-' + String(i + 1).padStart(2, '0'),
    status: i < 14 ? 'occupied' : i < 17 ? 'available' : 'reserved',
    resident: i < 14 ? 'Example Resident ' + String(i + 1).padStart(2, '0') : '',
    rent: i % 3 === 0 ? 725 : 675,
  }));
const initialCustomers = (): DemoCustomer[] => initialSites()
  .filter((site) => site.status === 'occupied')
  .map((site, i) => ({ id: i + 1, name: site.resident, siteId: site.id }));
const initialJobs = (): Job[] => [
  { id: 1, title: 'Inspect water hookup', location: 'RV-04', status: 'Open' },
  { id: 2, title: 'Replace walkway light', location: 'North path', status: 'Open' },
  { id: 3, title: 'Check laundry equipment', location: 'Laundry room', status: 'Done' },
];
const initialStock = (): Stock[] => [
  { name: 'Water fittings', quantity: 12, unit: 'pieces' },
  { name: 'Air filters', quantity: 4, unit: 'pieces' },
  { name: 'Cleaning supplies', quantity: 9, unit: 'kits' },
];
const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const startingRegister = (site: string) => 12500 + Number(site.slice(-2)) * 31;

export function GuestDemo() {
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>('overview');
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [customers, setCustomers] = useState<DemoCustomer[]>(initialCustomers);
  const [plannedCapacity, setPlannedCapacity] = useState(700);
  const [sitePage, setSitePage] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [siteQuery, setSiteQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [customerSite, setCustomerSite] = useState('unassigned');
  const [plannerReset, setPlannerReset] = useState(0);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [stock, setStock] = useState<Stock[]>(initialStock);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [meterSite, setMeterSite] = useState('RV-01');
  const [meterValue, setMeterValue] = useState(String(startingRegister('RV-01') + 45));
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');

  const occupied = sites.filter((s) => s.status === 'occupied').length;
  const available = sites.filter((s) => s.status === 'available').length;
  const reserved = sites.filter((s) => s.status === 'reserved').length;
  const rentTotal = sites.filter((s) => s.status === 'occupied').reduce((n, s) => n + s.rent, 0);
  const unpaidJobs = jobs.filter((j) => j.status === 'Open').length;
  const currentTab = menu.find((m) => m.id === tab) ?? menu[0];
  const latest = [...readings].reverse().find((r) => r.site === meterSite);
  const previousRegister = latest?.value ?? startingRegister(meterSite);
  const sampleUsage = readings.reduce((total, r) => total + r.usage, 0);
  const filteredSites = sites.filter((s) => (siteFilter === 'all' || s.status === siteFilter) && s.id.toLowerCase().includes(siteQuery.toLowerCase().trim()));
  const sitePages = Math.max(1, Math.ceil(filteredSites.length / 60));
  const visibleSitePage = Math.min(sitePage, sitePages - 1);
  const filteredCustomers = customers.filter((c) => (c.name + ' ' + (c.siteId ?? '')).toLowerCase().includes(customerQuery.toLowerCase().trim()));
  const customerPages = Math.max(1, Math.ceil(filteredCustomers.length / 50));
  const visibleCustomerPage = Math.min(customerPage, customerPages - 1);
  function addSites(count: number) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 250) return;
    const nextNumber = sites.reduce((max, site) => Math.max(max, Number(site.id.slice(3)) || 0), 0) + 1;
    const added = Array.from({ length: count }, (_, i): Site => ({
      id: 'RV-' + String(nextNumber + i).padStart(2, '0'),
      status: 'available',
      resident: '',
      rent: 675,
    }));
    setSites((current) => [...current, ...added]);
    setSitePage(0);
    setNotice('Added ' + count + ' fictional space' + (count === 1 ? '' : 's') + '. Site count: ' + (sites.length + count) + '.');
  }
  function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCustomerName.trim();
    if (!name || name.length > 100) { setNotice('Enter a short fictional customer name (1–100 characters).'); return; }
    const id = customerSite === 'unassigned' ? null : customerSite;
    if (id && !sites.some((site) => site.id === id && site.status === 'available')) {
      setNotice('Choose an available space or add the person to your waiting list.');
      return;
    }
    const next = customers.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    setCustomers((current) => [...current, { id: next, name, siteId: id }]);
    if (id) setSites((current) => current.map((site) => site.id === id ? { ...site, status: 'occupied', resident: name } : site));
    setNewCustomerName('');
    setCustomerSite('unassigned');
    setCustomerPage(0);
    setNotice(name + ' added to this fictional ' + (id ? 'site' : 'waiting list') + '. No account or real customer record was created.');
  }

  function updateSite(id: string) {
    const original = sites.find((site) => site.id === id);
    if (!original) return;
    const next: Status =
      original.status === 'available' ? 'reserved' :
      original.status === 'reserved' ? 'occupied' : 'available';
    const changed =
      next === 'reserved' ? 'Reserved' : next === 'occupied' ? 'Checked in' : 'Checked out';
    let resident = '';
    if (next === 'occupied') {
      const nextId = customers.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      resident = 'Example Walk-in ' + nextId;
      setCustomers((current) => [...current, { id: nextId, name: resident, siteId: id }]);
    }
    if (original.status === 'occupied') {
      setCustomers((current) => current.map((customer) => customer.siteId === id ? { ...customer, siteId: null } : customer));
    }
    setSites((old) =>
      old.map((site) =>
        site.id === id ? { ...site, status: next, resident } : site
      )
    );
    setNotice(id + ' — ' + changed + ' in this sample only. No actual booking was made.');
  }

  function saveReading(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(meterValue);
    if (!Number.isSafeInteger(value) || value <= previousRegister || value > 99999999) {
      setNotice('Enter a whole-number meter reading higher than ' + previousRegister + '.');
      return;
    }
    setReadings((old) => [...old, { site: meterSite, value, usage: value - previousRegister }]);
    setNotice('Sample reading saved in this browser view. No database was updated.');
    setMeterValue(String(value + 20));
  }

  function resetDemo() {
    setSites(initialSites());
    setCustomers(initialCustomers());
    setPlannedCapacity(700);
    setSitePage(0);
    setCustomerPage(0);
    setSiteQuery('');
    setCustomerQuery('');
    setNewCustomerName('');
    setCustomerSite('unassigned');
    setPlannerReset((current) => current + 1);
    setJobs(initialJobs());
    setStock(initialStock());
    setReadings([]);
    setMeterSite('RV-01');
    setMeterValue(String(startingRegister('RV-01') + 45));
    setInvoiceOpen(false);
    setSiteFilter('all');
    setTab('overview');
    setNotice('The fictional demo has been reset.');
  }

  return (
    <div className="demo-shell">
      <a className="skip-link" href="#demo-content">Skip to guest demo</a>
      <header className="demo-topbar">
        <Link className="demo-brand" href="/demo" aria-label="ForgeOS guest demo home">
          <span className="brand-mark"><Flame size={22} /></span>
          <span>Forge<span className="brand-os">OS</span><small>PROPERTY MANAGER</small></span>
        </Link>
        <div className="demo-top-actions">
          <span className="demo-mode"><ShieldCheck size={15} /> Safe guest demo</span>
          <Link className="demo-signin" href="/login"><LockKeyhole size={15} /> Staff sign in</Link>
        </div>
      </header>

      <div className="demo-banner" role="note">
        <strong>DEMO MODE</strong>
        <span>Fictional people, sample balances, and pretend actions. Nothing here is connected to a real property or saved to the database.</span>
        <button type="button" disabled={!hydrated} onClick={resetDemo}><RotateCcw size={15} /> Reset sample</button>
      </div>

      <div className="demo-body">
        <aside className="demo-rail">
          <div className="demo-property-icon"><Building2 size={21} /></div>
          <div className="demo-property-label"><strong>Pine Creek RV Park</strong><span>Example property · {sites.length.toLocaleString()} spaces</span></div>
          <nav className="demo-nav" aria-label="Guest demo navigation">
            {menu.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" disabled={!hydrated} className={tab === item.id ? 'demo-nav-item selected' : 'demo-nav-item'} aria-current={tab === item.id ? 'page' : undefined} onClick={() => {setTab(item.id); setNotice('');}}>
                  <Icon size={18} /> {item.label}
                </button>
              );
            })}
          </nav>
          <div className="demo-rail-bottom">
            <LockKeyhole size={18} />
            <p>Real records stay private. Sign in separately to manage a real property.</p>
          </div>
        </aside>

        <main id="demo-content" className="demo-main">
          <div className="demo-heading">
            <div>
              <span className="demo-eyebrow">EXPLORE FORGEOS • NO ACCOUNT NEEDED</span>
              <h1>{currentTab.label}</h1>
              <p>A hands-on look at how one system can run an RV park, campground, or rental property.</p>
            </div>
            <span className="demo-property-pill"><Building2 size={16} /> Pine Creek RV Park <span>Sample</span></span>
          </div>
          {notice && <p className="demo-notice" role="status">{notice}</p>}

          {tab === 'overview' && (
            <>
              <section className="demo-welcome">
                <div>
                  <span className="demo-eyebrow">PROPERTY OVERVIEW</span>
                  <h2>One system. Every site. Total control.</h2>
                  <p>See availability, utility readings, billing and your team&apos;s work in one place.</p>
                  <button className="demo-hero-button" type="button" disabled={!hydrated} onClick={() => setTab('sites')}>Explore the site map <ArrowRight size={17}/></button>
                </div>
                <div className="demo-welcome-icon" aria-hidden="true"><MapPinned size={58}/></div>
              </section>
              <div className="demo-kpis">
                <Metric label="Occupied spaces" value={String(occupied) + ' / ' + sites.length.toLocaleString()} detail={String(Math.round((occupied / Math.max(1, sites.length)) * 100)) + '% occupancy'} />
                <Metric label="Available now" value={String(available)} detail={String(reserved) + ' reservations'} />
                <Metric label="Sample monthly rent" value={money(rentTotal)} detail="Illustrative only" />
                <Metric label="Open work orders" value={String(unpaidJobs)} detail="Tasks to review" />
                <Metric label="Customer records" value={customers.length.toLocaleString()} detail="Created as people arrive" />
                <Metric label="Planned spaces" value={plannedCapacity.toLocaleString()} detail="Adjust in Property layout" />
              </div>
              <div className="demo-two-columns">
                <section className="demo-panel">
                  <div className="demo-section-head"><h2>Sites at a glance</h2><button type="button" disabled={!hydrated} onClick={() => setTab('sites')}>View map <ArrowRight size={15}/></button></div>
                  <div className="demo-mini-map">
                    {sites.slice(0, 12).map((s) => <button type="button" disabled={!hydrated} key={s.id} title={s.id + ': ' + s.status} className={'demo-tile ' + s.status} onClick={() => {setTab('sites'); setNotice('Select any space to try a sample check-in or reservation.')}}>{s.id}</button>)}
                  </div>
                  <div className="demo-key"><span><i className="demo-dot occupied"/> Occupied</span><span><i className="demo-dot available"/> Available</span><span><i className="demo-dot reserved"/> Reserved</span></div>
                </section>
                <section className="demo-panel">
                  <div className="demo-section-head"><h2>Daily operations</h2><button type="button" disabled={!hydrated} onClick={() => setTab('maintenance')}>Manage tasks <ArrowRight size={15}/></button></div>
                  <div className="demo-tasks">
                    {jobs.map((job) => <div key={job.id} className="demo-task"><span className={job.status === 'Done' ? 'demo-task-icon done' : 'demo-task-icon'}><CheckCircle2 size={19}/></span><span><strong>{job.title}</strong><small>{job.location} · {job.status}</small></span></div>)}
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === 'sites' && (
            <>
              <section className="demo-panel">
                <div className="demo-section-head">
                  <div><h2>Interactive property map</h2><p>{sites.length.toLocaleString()} created spaces. Tap a space to simulate a reservation, check-in or checkout.</p></div>
                  <button className="demo-action" type="button" onClick={() => setTab('layout')}><Plus size={16}/> Add spaces / upload layout</button>
                </div>
                <div className="demo-planner-controls">
                  <label htmlFor="demo-site-search">Find a space
                    <input id="demo-site-search" placeholder="e.g. RV-700" value={siteQuery} onChange={(e) => {setSiteQuery(e.target.value); setSitePage(0);}}/>
                  </label>
                  <label className="demo-filter" htmlFor="demo-site-status">Status
                    <select id="demo-site-status" value={siteFilter} onChange={(e) => {setSiteFilter(e.target.value); setSitePage(0);}}><option value="all">All spaces</option><option value="occupied">Occupied</option><option value="available">Available</option><option value="reserved">Reserved</option></select>
                  </label>
                </div>
                <div className="demo-key"><span><i className="demo-dot occupied"/> Occupied</span><span><i className="demo-dot available"/> Available</span><span><i className="demo-dot reserved"/> Reserved</span></div>
                <div className="demo-full-map">
                  {filteredSites.slice(visibleSitePage * 60, visibleSitePage * 60 + 60).map((site) => <button type="button" key={site.id} data-site={site.id} className={'demo-map-space ' + site.status} onClick={() => updateSite(site.id)}><span><Home size={19}/>{site.id}</span><small>{site.status}</small><small>{money(site.rent)} / mo</small></button>)}
                </div>
                <Pagination page={visibleSitePage} pages={sitePages} total={filteredSites.length} label="spaces" onChange={setSitePage}/>
                <p className="demo-caption">60 spaces per page keeps the map usable even when your example has 700 or more. Changes are temporary.</p>
              </section>
            </>
          )}

          {tab === 'layout' && (
            <GuestPropertyPlanner key={plannerReset} sites={sites} target={plannedCapacity} onTargetChange={setPlannedCapacity} onAddSites={addSites}/>
          )}

          {tab === 'tenants' && (
            <>
              <section className="demo-panel">
                <div className="demo-section-head"><div><h2>Customers as they arrive</h2><p>{customers.length.toLocaleString()} sample customers, independent of the number of spaces. Add one at a time or maintain a waiting list.</p></div></div>
                <form className="demo-planner-controls" onSubmit={addCustomer}>
                  <label htmlFor="demo-customer-name">Fictional customer name
                    <input id="demo-customer-name" required maxLength={100} value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="e.g. Example Guest 15"/>
                  </label>
                  <label htmlFor="demo-customer-site">Assign an available site (optional)
                    <select id="demo-customer-site" value={customerSite} onChange={(e) => setCustomerSite(e.target.value)}>
                      <option value="unassigned">Waitlist / not assigned</option>
                      {sites.filter((site) => site.status === 'available').map((site) => <option key={site.id} value={site.id}>{site.id}</option>)}
                    </select>
                  </label>
                  <button className="demo-action" type="submit"><Plus size={16}/> Add example customer</button>
                </form>
                <p className="demo-caption">For privacy, use fictional names in this public demo. Real customer records belong in the secured owner workspace.</p>
              </section>
              <section className="demo-panel">
                <div className="demo-section-head"><div><h2>Customer directory</h2><p>Lists are paginated in groups of 50 so larger parks stay easy to use.</p></div>
                  <label className="demo-filter" htmlFor="demo-customer-search">Search
                    <input id="demo-customer-search" placeholder="Name or site" value={customerQuery} onChange={(e) => {setCustomerQuery(e.target.value); setCustomerPage(0);}}/>
                  </label>
                </div>
                <div className="demo-table-wrap"><table className="demo-table"><thead><tr><th>Customer</th><th>Site</th><th>Monthly rent</th><th>Occupancy</th></tr></thead><tbody>{filteredCustomers.slice(visibleCustomerPage * 50, visibleCustomerPage * 50 + 50).map((customer) => {
                  const site = sites.find((s) => s.id === customer.siteId);
                  return <tr key={customer.id}><td>{customer.name}</td><td>{customer.siteId ?? 'Not assigned'}</td><td>{site ? money(site.rent) : '—'}</td><td><span className={'demo-status ' + (site ? 'occupied' : 'reserved')}>{site ? 'Current resident' : 'Waiting / past guest'}</span></td></tr>;
                })}</tbody></table></div>
                <Pagination page={visibleCustomerPage} pages={customerPages} total={filteredCustomers.length} label="customers" onChange={setCustomerPage}/>
              </section>
            </>
          )}

          {tab === 'meters' && (
            <div className="demo-two-columns">
              <section className="demo-panel">
                <h2><Gauge size={19}/> Tablet meter reader</h2>
                <p>Try entering a fictional electricity reading—just like a worker walking the park with a tablet.</p>
                <form className="demo-form" onSubmit={saveReading}>
                  <label htmlFor="demo-meter-site">Site</label>
                  <select id="demo-meter-site" value={meterSite} onChange={(e) => {setMeterSite(e.target.value); const existing = [...readings].reverse().find((r) => r.site === e.target.value); setMeterValue(String((existing?.value ?? startingRegister(e.target.value)) + 45));}}>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                  </select>
                  <div className="demo-form-hint">Previous sample register: <strong>{previousRegister.toLocaleString()} kWh</strong></div>
                  <label htmlFor="demo-meter-register">New meter register (kWh)</label>
                  <input id="demo-meter-register" type="number" required min={previousRegister + 1} max={99999999} step="1" value={meterValue} onChange={(e) => setMeterValue(e.target.value)}/>
                  <button type="submit" className="demo-action">Save example reading <ArrowRight size={16}/></button>
                </form>
              </section>
              <section className="demo-panel">
                <h2><ClipboardList size={19}/> Reading history</h2>
                {readings.length ? <div className="demo-table-wrap"><table className="demo-table"><thead><tr><th>Site</th><th>Register</th><th>Usage</th></tr></thead><tbody>{[...readings].reverse().map((r, i) => <tr key={i}><td>{r.site}</td><td>{r.value.toLocaleString()}</td><td>+{r.usage} kWh</td></tr>)}</tbody></table></div> : <div className="demo-placeholder">No new readings yet. Save one to see how it appears here.</div>}
                <p className="demo-caption">Recorded usage in this demo: {sampleUsage} kWh. Nothing is transmitted or billed.</p>
              </section>
            </div>
          )}

          {tab === 'billing' && (
            <div className="demo-two-columns">
              <section className="demo-panel">
                <h2><Receipt size={20}/> Sample invoice</h2>
                <p>A preview of the rent and utility charges that an owner could review before issuing an invoice.</p>
                <div className="demo-invoice"><div><span>Monthly site rent</span><strong>$675.00</strong></div><div><span>Example electricity usage</span><strong>$38.00</strong></div><div><span>Example water / sewer</span><strong>$24.00</strong></div><div className="demo-invoice-total"><span>Illustrative total</span><strong>$737.00</strong></div></div>
                <button type="button" className="demo-action" onClick={() => setInvoiceOpen((open) => !open)}>{invoiceOpen ? 'Hide sample statement' : 'Preview sample statement'} <ArrowRight size={16}/></button>
                {invoiceOpen && <div className="demo-statement" role="region" aria-label="Example statement"><strong>ForgeOS • EXAMPLE ONLY</strong><p>Site RV-02 · Fictional billing period</p><p>Balance shown: $737.00</p><small>Not an issued bill, charge, or actual payment request.</small></div>}
              </section>
              <section className="demo-panel">
                <h2><CalendarDays size={19}/> Billing workflow</h2>
                <div className="demo-step"><strong>1</strong><span>Review utility readings</span></div>
                <div className="demo-step"><strong>2</strong><span>Calculate rent and utilities</span></div>
                <div className="demo-step"><strong>3</strong><span>Approve and issue statements</span></div>
                <div className="demo-step"><strong>4</strong><span>Record payments and receipts</span></div>
                <p className="demo-caption">Real invoices, payments, tax rules, and corrections require an authenticated owner or authorized staff member.</p>
              </section>
            </div>
          )}

          {tab === 'maintenance' && (
            <section className="demo-panel">
              <div className="demo-section-head"><div><h2><Wrench size={19}/> Work orders</h2><p>Complete an example task to see how staff progress could be tracked.</p></div><span className="demo-property-pill">{unpaidJobs} open</span></div>
              <div className="demo-work-list">{jobs.map((job) => <article key={job.id} className="demo-work"><span className={job.status === 'Done' ? 'demo-task-icon done' : 'demo-task-icon'}><Wrench size={20}/></span><div><strong>{job.title}</strong><small>{job.location} · <span className={'demo-status ' + (job.status === 'Done' ? 'available' : 'reserved')}>{job.status}</span></small></div><button type="button" disabled={job.status === 'Done'} onClick={() => {setJobs((old) => old.map((j) => j.id === job.id ? {...j, status: 'Done'} : j)); setNotice('Example work order marked complete. No real job changed.');}}>{job.status === 'Done' ? 'Completed' : 'Mark complete'}</button></article>)}</div>
            </section>
          )}

          {tab === 'inventory' && (
            <section className="demo-panel">
              <div className="demo-section-head"><div><h2><Boxes size={19}/> Inventory & supplies</h2><p>Practice receiving an item into the fictional stockroom.</p></div><span className="demo-property-pill">Sample quantities</span></div>
              <div className="demo-work-list">{stock.map((item) => <article key={item.name} className="demo-work"><span className="demo-task-icon"><Boxes size={20}/></span><div><strong>{item.name}</strong><small>{item.quantity} {item.unit} in stock</small></div><button type="button" onClick={() => {setStock((old) => old.map((s) => s.name === item.name ? {...s, quantity: s.quantity + 1} : s)); setNotice('Added one fictional ' + item.unit + ' to the sample stockroom.');}}>Receive +1</button></article>)}</div>
            </section>
          )}

          {tab === 'resident' && (
            <div className="demo-two-columns">
              <section className="demo-panel">
                <h2><Home size={19}/> Resident account preview</h2>
                <div className="demo-resident-welcome"><span className="demo-avatar">R</span><div><strong>Welcome home, Example Resident!</strong><p>Sample site RV-02 · Pine Creek RV Park</p></div></div>
                <div className="demo-invoice"><div><span>Sample current statement</span><strong>$737.00</strong></div><div><span>Maintenance request</span><strong>None open</strong></div><div><span>Upcoming rent cycle</span><strong>Example month</strong></div></div>
                <p className="demo-caption">The real resident portal requires a verified account linked by the property owner. This preview contains no actual resident records.</p>
              </section>
              <section className="demo-panel">
                <h2><ShieldCheck size={19}/> Your privacy matters</h2>
                <p>Actual residents can see only their own authorized documents. Staff must sign in to access operational records.</p>
                <div className="demo-step"><strong><CheckCircle2 size={16}/></strong><span>Private billing and receipts</span></div>
                <div className="demo-step"><strong><CheckCircle2 size={16}/></strong><span>Protected contact information</span></div>
                <div className="demo-step"><strong><CheckCircle2 size={16}/></strong><span>Maintenance request history</span></div>
              </section>
            </div>
          )}

          <footer className="demo-footer"><span>ForgeOS guest preview · Sample data only · Your changes are temporary</span><Link href="/login">Manage a real property <ArrowRight size={15}/></Link></footer>
        </main>
      </div>
    </div>
  );
}

function Pagination({page, pages, total, label, onChange}: {page: number; pages: number; total: number; label: string; onChange: (n: number) => void}) {
  return <div className="demo-pagination" aria-label={label + ' pagination'}>
    <span>{total.toLocaleString()} {label} · Page {page + 1} of {pages}</span>
    <div><button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
    <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Next</button></div>
  </div>;
}

function Metric({label, value, detail}: {label: string; value: string; detail: string}) {
  return <article className="demo-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

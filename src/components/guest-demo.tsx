'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import { GuestPropertyPlanner } from '@/components/guest-property-planner';
import { GuestSiteEditor, GuestCustomerForm, makeDemoSite, makeDemoCustomer, designationLabel, type DemoSite, type DemoCustomer } from '@/components/guest-record-editors';
import { GuestSiteMedia, validateDemoPhotos, type DemoSitePhoto, type DemoVehicle, type PhotoCategory } from '@/components/guest-site-media';
import { GuestSiteAccount, type DemoMeterRecord } from '@/components/guest-site-account';
import { demoPropertyToday, isRentPastDue, rentMonthKey, type DemoNoticeDraft, type DemoNoticeKind } from '@/lib/guest-site-account';
import {
  ArrowRight, Boxes, Building2, CalendarDays, CheckCircle2, ClipboardList,
  Flame, Gauge, Home, LayoutDashboard, LockKeyhole, MapPinned, Receipt,
  RotateCcw, ShieldCheck, Users, Wrench, UploadCloud, Plus,
} from 'lucide-react';

type Tab = 'overview' | 'sites' | 'layout' | 'tenants' | 'meters' | 'billing' | 'maintenance' | 'inventory' | 'resident';
type Status = 'occupied' | 'available' | 'reserved';
type Site = DemoSite;
type Job = { id: number; title: string; location: string; status: 'Open' | 'Done' };
type Stock = { name: string; quantity: number; unit: string; barcode?: string; unitsPerCase?: number };
type Reading = DemoMeterRecord;

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
    ...makeDemoSite('RV-' + String(i + 1).padStart(2, '0'), 'rv', i < 14 ? 'occupied' : i < 17 ? 'available' : 'reserved', i % 3 === 0 ? 725 : 675),
    resident: i < 14 ? 'Example Resident ' + String(i + 1).padStart(2, '0') : '',
  }));
const initialCustomers = (): DemoCustomer[] => initialSites()
  .filter((site) => site.status === 'occupied')
  .map((site, i) => makeDemoCustomer(i + 1, site.resident, site.id));
const initialJobs = (): Job[] => [
  { id: 1, title: 'Inspect water hookup', location: 'RV-04', status: 'Open' },
  { id: 2, title: 'Replace walkway light', location: 'North path', status: 'Open' },
  { id: 3, title: 'Check laundry equipment', location: 'Laundry room', status: 'Done' },
];
const GUEST_INVENTORY_STORAGE_KEY = 'forgeos-guest-inventory-v1';
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
  const [overviewQuery, setOverviewQuery] = useState('');
  const [overviewStatus, setOverviewStatus] = useState<'all' | Status>('all');
  const [overviewPage, setOverviewPage] = useState(0);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<DemoSitePhoto[]>([]);
  const [vehicles, setVehicles] = useState<DemoVehicle[]>([]);
  const photoUrlsRef = useRef(new Set<string>());
  const photoIdRef = useRef(0);
  const vehicleIdRef = useRef(0);
  useEffect(() => {
    const photoUrls = photoUrlsRef.current;
    return () => { photoUrls.forEach((url) => URL.revokeObjectURL(url)); photoUrls.clear(); };
  }, []);
  useEffect(() => {
    if (tab === 'sites' && selectedSiteId) {
      document.getElementById('demo-selected-space')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [tab, selectedSiteId]);
  const [plannerReset, setPlannerReset] = useState(0);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [stock, setStock] = useState<Stock[]>(initialStock);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [newStockName, setNewStockName] = useState('');
  const [newStockQuantity, setNewStockQuantity] = useState('0');
  const [newStockUnit, setNewStockUnit] = useState('pieces');
  const [stockSearch, setStockSearch] = useState('');
  const [newStockBarcode, setNewStockBarcode] = useState('');
  const [newStockCaseSize, setNewStockCaseSize] = useState('1');
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanAction, setScanAction] = useState<'receive' | 'use'>('receive');
  const [scanCases, setScanCases] = useState('1');
  const [editingStockName, setEditingStockName] = useState<string | null>(null);
  const [stockEdit, setStockEdit] = useState({name:'',quantity:'0',unit:'',barcode:'',unitsPerCase:'1'});
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
      const stored = window.localStorage.getItem(GUEST_INVENTORY_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length <= 10000) {
          const valid = parsed.every((item: unknown) => {
            if (typeof item !== 'object' || item === null) return false;
            const entry = item as Partial<Stock>;
            return typeof entry.name === 'string' && entry.name.trim().length > 0 && entry.name.length <= 100 &&
              typeof entry.unit === 'string' && entry.unit.trim().length > 0 && entry.unit.length <= 40 &&
              typeof entry.quantity === 'number' && Number.isSafeInteger(entry.quantity) && entry.quantity >= 0 && entry.quantity <= 1000000 &&
              (entry.barcode === undefined || (typeof entry.barcode === 'string' && (entry.barcode === '' || /^[A-Za-z0-9-]{4,64}$/.test(entry.barcode)))) &&
              (entry.unitsPerCase === undefined || (typeof entry.unitsPerCase === 'number' && Number.isSafeInteger(entry.unitsPerCase) && entry.unitsPerCase >= 1 && entry.unitsPerCase <= 1000000));
          });
          if (valid) {
            const entries = parsed as Stock[];
            const names = entries.map((item) => item.name.toLocaleLowerCase());
            const barcodes = entries.map((item) => item.barcode).filter((barcode): barcode is string => !!barcode);
            if (new Set(names).size === names.length && new Set(barcodes).size === barcodes.length) {
              setStock(entries);
            }
          }
        }
      }
      } catch {
        // Storage can be blocked or contain old data; retain fictional samples.
      }
      if (!cancelled) setStockLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!stockLoaded) return;
    try {
      window.localStorage.setItem(GUEST_INVENTORY_STORAGE_KEY, JSON.stringify(stock));
    } catch {
      // Quota or privacy settings may block local saving; guest demo still works.
    }
  }, [stock, stockLoaded]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [paidRentKeys, setPaidRentKeys] = useState<string[]>([]);
  const [noticeDrafts, setNoticeDrafts] = useState<DemoNoticeDraft[]>([]);
  const todayAtPark = demoPropertyToday();
  const currentRentMonth = rentMonthKey(todayAtPark);
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
  const filteredSites = sites.filter((s) => {
    if (siteFilter !== 'all' && s.status !== siteFilter) return false;
    const search = siteQuery.toLowerCase().trim();
    return (s.id + ' ' + s.label + ' ' + designationLabel(s.designation)).toLowerCase().includes(search);
  });
  const sitePages = Math.max(1, Math.ceil(filteredSites.length / 60));
  const visibleSitePage = Math.min(sitePage, sitePages - 1);
  // One indexed view of each site's current customer. Do not duplicate
  // resident details in site records; changes to customer contact info appear
  // immediately in Overview and the linked space record.
  const customerBySite = new Map(customers.filter((customer) => !!customer.siteId).map((customer) => [customer.siteId!, customer]));
  const rentPaid = (customerId: number) => paidRentKeys.includes(customerId + ':' + currentRentMonth);
  const flagged = (site: Site) => {
    const customer = customerBySite.get(site.id);
    return isRentPastDue(todayAtPark, site.status === 'occupied' && !!customer,
      customer ? rentPaid(customer.id) : false);
  };
  const overdueCount = sites.filter(flagged).length;
  const overviewRows = sites.filter((site) => {
    if (overviewStatus !== 'all' && site.status !== overviewStatus) return false;
    const customer = customerBySite.get(site.id);
    const search = overviewQuery.trim().toLowerCase();
    return [site.id, site.label, designationLabel(site.designation), site.section,
      customer?.name, customer?.phone, customer?.email, site.resident]
      .filter(Boolean).join(' ').toLowerCase().includes(search);
  });
  const overviewPages = Math.max(1, Math.ceil(overviewRows.length / 25));
  const visibleOverviewPage = Math.min(overviewPage, overviewPages - 1);
  const filteredCustomers = customers.filter((c) => (c.name + ' ' + (c.siteId ?? '')).toLowerCase().includes(customerQuery.toLowerCase().trim()));
  const customerPages = Math.max(1, Math.ceil(filteredCustomers.length / 50));
  const visibleCustomerPage = Math.min(customerPage, customerPages - 1);
  function openSpaceRecord(siteId: string) {
    setSelectedSiteId(siteId);
    setSiteQuery(siteId);
    setSiteFilter('all');
    setSitePage(0);
    setTab('sites');
    setNotice('');
  }
  function openCustomerRecord(customerId: number) {
    setSelectedCustomerId(customerId);
    setCustomerQuery('');
    setCustomerPage(0);
    setTab('tenants');
    setNotice('');
  }
  function addSites(count: number) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 250) return;
    const nextNumber = sites.reduce((max, site) => Math.max(max, Number(site.id.slice(3)) || 0), 0) + 1;
    const added = Array.from({ length: count }, (_, i): Site => makeDemoSite('RV-' + String(nextNumber + i).padStart(2, '0')));
    setSites((current) => [...current, ...added]);
    setSitePage(0);
    setNotice('Added ' + count + ' fictional space' + (count === 1 ? '' : 's') + '. Site count: ' + (sites.length + count) + '.');
  }
  function saveCustomer(record: DemoCustomer) {
    const existing = record.id ? customers.find((c) => c.id === record.id) : undefined;
    const nextId = existing?.id ?? (customers.reduce((max, c) => Math.max(max, c.id), 0) + 1);
    const updated = { ...record, id: nextId };
    const newSite = updated.siteId;
    if (newSite && !sites.some((site) => site.id === newSite && (site.status === 'available' || site.id === existing?.siteId))) {
      setNotice('Choose a currently available site or keep this customer unassigned.');
      return;
    }
    setCustomers((current) => existing
      ? current.map((customer) => customer.id === nextId ? updated : customer)
      : [...current, updated]);
    setSites((current) => current.map((site) => {
      if (existing?.siteId === site.id && newSite !== site.id) return { ...site, status: 'available', resident: '' };
      if (newSite === site.id) return { ...site, status: 'occupied', resident: updated.name };
      return site;
    }));
    setSelectedCustomerId(null);
    setCustomerPage(0);
    setNotice(updated.name + (existing ? ' updated' : ' added') + ' in this fictional ' + (newSite ? 'site' : 'waiting list') + '. No real record was created.');
  }
  function saveSpace(updated: Site) {
    setSites((current) => current.map((site) => site.id === updated.id ? updated : site));
    setNotice(updated.id + ' details updated in the sample, including the space type and rent.');
  }
  function addPhotos(siteId: string, category: PhotoCategory, files: File[]): string {
    const validation = validateDemoPhotos(photos.filter((photo) => photo.siteId === siteId).length, files);
    if (validation) return validation;
    const added = files.map((file): DemoSitePhoto => {
      photoIdRef.current += 1;
      const url = URL.createObjectURL(file);
      photoUrlsRef.current.add(url);
      return { id: photoIdRef.current, siteId, category, name: file.name, url };
    });
    setPhotos((current) => [...current, ...added]);
    return 'Added ' + added.length + ' local picture' + (added.length === 1 ? '' : 's') + ' to ' + siteId + '. Not uploaded.';
  }
  function removePhoto(id: number) {
    const found = photos.find((photo) => photo.id === id);
    if (!found) return;
    photoUrlsRef.current.delete(found.url);
    URL.revokeObjectURL(found.url);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  }
  function addVehicle(siteId: string, vehicle: Pick<DemoVehicle, 'category' | 'description' | 'identification'>): string {
    if (!vehicle.description.trim() || vehicle.description.length > 100 || vehicle.identification.length > 40)
      return 'Enter a fictional description up to 100 characters.';
    vehicleIdRef.current += 1;
    setVehicles((current) => [...current, { ...vehicle, id: vehicleIdRef.current, siteId }]);
    return 'Added sample ' + vehicle.description + ' to ' + siteId + '.';
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
      setCustomers((current) => [...current, makeDemoCustomer(nextId, resident, id)]);
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

  function recordSampleRent(customerId: number) {
    const key = customerId + ':' + currentRentMonth;
    setPaidRentKeys((old) => old.includes(key) ? old : [...old, key]);
    setNotice('Fictional rent marked paid for ' + currentRentMonth + '. No payment or receipt was created.');
  }
  function prepareSampleNotice(customer: DemoCustomer, kind: DemoNoticeKind, message: string) {
    if (!customer.siteId) return;
    setNoticeDrafts((old) => [...old, {
      id: (old.at(-1)?.id ?? 0) + 1,
      siteId: customer.siteId!,
      customerId: customer.id,
      month: currentRentMonth,
      kind,
      message,
      preparedOn: new Date().toISOString(),
      phone: customer.phone,
    }]);
    setNotice('Notice draft saved for staff review only. Nothing was texted, sent, assessed or served.');
  }
  function openMeterForSite(siteId: string) {
    setMeterSite(siteId);
    const last = [...readings].reverse().find((r) => r.site === siteId);
    setMeterValue(String((last?.value ?? startingRegister(siteId)) + 45));
    setTab('meters');
    setNotice('');
  }
  function saveReading(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(meterValue);
    if (!Number.isSafeInteger(value) || value <= previousRegister || value > 99999999) {
      setNotice('Enter a whole-number meter reading higher than ' + previousRegister + '.');
      return;
    }
    setReadings((old) => [...old, { site: meterSite, value, usage: value - previousRegister, capturedAt: new Date().toISOString() }]);
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
    setOverviewQuery('');
    setOverviewStatus('all');
    setOverviewPage(0);
    setSelectedSiteId(null);
    setSelectedCustomerId(null);
    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current.clear();
    setPhotos([]);
    setVehicles([]);
    setPlannerReset((current) => current + 1);
    setJobs(initialJobs());
    setStock(initialStock());
    try { window.localStorage.removeItem(GUEST_INVENTORY_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    setNewStockName('');
    setNewStockQuantity('0');
    setNewStockUnit('pieces');
    setStockSearch('');
    setNewStockBarcode('');
    setNewStockCaseSize('1');
    setScanBarcode('');
    setScanAction('receive');
    setScanCases('1');
    setEditingStockName(null);
    setReadings([]);
    setPaidRentKeys([]);
    setNoticeDrafts([]);
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
                <Metric label="Rent red flags" value={String(overdueCount)} detail="Fictional unpaid rent after 5th" />
                <Metric label="Sample monthly rent" value={money(rentTotal)} detail="Illustrative only" />
                <Metric label="Open work orders" value={String(unpaidJobs)} detail="Tasks to review" />
                <Metric label="Customer records" value={customers.length.toLocaleString()} detail="Created as people arrive" />
                <Metric label="Planned spaces" value={plannedCapacity.toLocaleString()} detail="Adjust in Property layout" />
              </div>
              <section className="demo-panel demo-overview-directory" aria-label="Overview spaces and customers">
                <div className="demo-section-head">
                  <div><h2>Spaces &amp; residents — quick lookup</h2><p>One row per space: who lives there, their contact information and fast access to the full space or customer record.</p></div>
                  <button type="button" onClick={() => setTab('sites')}>View site map <ArrowRight size={15}/></button>
                </div>
                <div className="demo-overview-filters">
                  <label htmlFor="demo-overview-search">Search space or customer
                    <input id="demo-overview-search" value={overviewQuery} placeholder="Space 88, apartment A-4, name or phone"
                      onChange={(event) => {setOverviewQuery(event.target.value);setOverviewPage(0);}}/>
                  </label>
                  <label htmlFor="demo-overview-status">Occupancy
                    <select id="demo-overview-status" value={overviewStatus}
                      onChange={(event) => {setOverviewStatus(event.target.value as 'all' | Status);setOverviewPage(0);}}>
                      <option value="all">All spaces</option>
                      <option value="occupied">Occupied</option>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                    </select>
                  </label>
                </div>
                <div className="demo-table-wrap">
                  <table className="demo-table demo-overview-table" aria-label="Overview space and customer rows">
                    <thead><tr><th>Space / unit</th><th>Customer name</th><th>Contact</th><th>Status</th><th>Open record</th></tr></thead>
                    <tbody>
                      {overviewRows.slice(visibleOverviewPage * 25, visibleOverviewPage * 25 + 25).map((site) => {
                        const customer = customerBySite.get(site.id);
                        return <tr key={site.id} data-overview-site={site.id}>
                          <td><strong>{designationLabel(site.designation)} · {site.label}</strong><small>{site.id}{site.section ? ' · ' + site.section : ''}</small></td>
                          <td><strong>{site.status === 'occupied' ? customer?.name || site.resident || 'Customer not recorded' : 'No customer assigned'}</strong></td>
                          <td>{customer ? <><span>{customer.phone || 'No phone on file'}</span><small>{customer.email || 'No email on file'}</small></> : <span>—</span>}</td>
                          <td><span className={'demo-status ' + site.status}>{site.status}</span>
                            {flagged(site) && <span className="demo-payment-flag" role="note">Rent past due</span>}</td>
                          <td><div className="demo-overview-actions">
                            <button type="button" className="demo-small-button" onClick={() => openSpaceRecord(site.id)} aria-label={'Open space record for ' + site.id}>Space record</button>
                            {customer && <button type="button" className="demo-small-button" onClick={() => openCustomerRecord(customer.id)} aria-label={'Open customer record for ' + site.id}>Customer</button>}
                          </div></td>
                        </tr>;
                      })}
                      {overviewRows.length === 0 && <tr><td colSpan={5} className="demo-overview-empty">No sites or residents match this search.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <Pagination page={visibleOverviewPage} pages={overviewPages} total={overviewRows.length} label="overview spaces" onChange={setOverviewPage}/>
              </section>
              <section className="demo-panel demo-overview-operations">
                <div className="demo-section-head"><h2>Daily operations</h2><button type="button" disabled={!hydrated} onClick={() => setTab('maintenance')}>Manage tasks <ArrowRight size={15}/></button></div>
                <div className="demo-tasks">
                  {jobs.map((job) => <div key={job.id} className="demo-task"><span className={job.status === 'Done' ? 'demo-task-icon done' : 'demo-task-icon'}><CheckCircle2 size={19}/></span><span><strong>{job.title}</strong><small>{job.location} · {job.status}</small></span></div>)}
                </div>
              </section>
            </>
          )}

          {tab === 'sites' && (
            <>
              <section className="demo-panel">
                <div className="demo-section-head">
                  <div><h2>Sites, spaces, apartments & mobile homes</h2><p>{sites.length.toLocaleString()} created spaces. Use <strong>Details & photos</strong> to add information for any space; tap the site tile to simulate check-in.</p></div>
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
                  {filteredSites.slice(visibleSitePage * 60, visibleSitePage * 60 + 60).map((site) => <div key={site.id} className="demo-space-card">
                    <button type="button" data-site={site.id} className={'demo-map-space ' + site.status} onClick={() => updateSite(site.id)}>
                      <span><Home size={19}/>{site.id}</span><small>{designationLabel(site.designation)}{site.label !== site.id ? ' · ' + site.label : ''}</small><small>{site.status} · {money(site.rent)} / mo</small>
                      {flagged(site) && <strong className="demo-payment-flag" aria-label={'Rent past due for ' + site.id}>RENT PAST DUE</strong>}
                    </button>
                    <button type="button" className="demo-site-details-button" aria-label={'Details and photos for ' + site.id} onClick={() => setSelectedSiteId(site.id)}>
                      Details &amp; photos {photos.some((photo) => photo.siteId === site.id) ? '(' + photos.filter((photo) => photo.siteId === site.id).length + ')' : ''}
                    </button>
                  </div>)}
                </div>
                <Pagination page={visibleSitePage} pages={sitePages} total={filteredSites.length} label="spaces" onChange={setSitePage}/>
                <p className="demo-caption">60 spaces per page keeps large properties manageable. Every space has its own editable details, vehicle list and local photo gallery.</p>
              </section>
              {selectedSiteId && sites.some((site) => site.id === selectedSiteId) && <div id="demo-selected-space">
                <GuestSiteEditor key={selectedSiteId} site={sites.find((site) => site.id === selectedSiteId)!}
                  customer={customerBySite.get(selectedSiteId)} onOpenCustomer={openCustomerRecord}
                  onSave={saveSpace} onClose={() => setSelectedSiteId(null)}/>
                <GuestSiteAccount key={'account-' + selectedSiteId} site={sites.find((site) => site.id === selectedSiteId)!}
                  customer={customerBySite.get(selectedSiteId)} readings={readings}
                  notices={noticeDrafts.filter((n) => n.siteId === selectedSiteId)}
                  paid={!!customerBySite.get(selectedSiteId) && rentPaid(customerBySite.get(selectedSiteId)!.id)}
                  today={todayAtPark} onRecordSamplePayment={recordSampleRent}
                  onDraft={prepareSampleNotice} onGoMeters={() => openMeterForSite(selectedSiteId)}/>
                <GuestSiteMedia
                  key={'media-' + selectedSiteId}
                  siteId={selectedSiteId}
                  photos={photos.filter((photo) => photo.siteId === selectedSiteId)}
                  vehicles={vehicles.filter((vehicle) => vehicle.siteId === selectedSiteId)}
                  onAddPhotos={(category, files) => addPhotos(selectedSiteId, category, files)}
                  onRemovePhoto={removePhoto}
                  onAddVehicle={(vehicle) => addVehicle(selectedSiteId, vehicle)}
                  onRemoveVehicle={(id) => setVehicles((current) => current.filter((vehicle) => vehicle.id !== id))}
                />
              </div>}
            </>
          )}

          {tab === 'layout' && (
            <GuestPropertyPlanner key={plannerReset} sites={sites} target={plannedCapacity} onTargetChange={setPlannedCapacity} onAddSites={addSites}/>
          )}

          {tab === 'tenants' && (
            <>
              <GuestCustomerForm sites={sites} onSave={saveCustomer}/>
              {selectedCustomerId !== null && customers.some((customer) => customer.id === selectedCustomerId) && <GuestCustomerForm key={'customer-' + selectedCustomerId} customer={customers.find((customer) => customer.id === selectedCustomerId)} sites={sites} onSave={saveCustomer} onClose={() => setSelectedCustomerId(null)}/>}
              {selectedCustomerId !== null && customers.some((customer) => customer.id === selectedCustomerId && !!customer.siteId) &&
                (() => { const customer = customers.find((c) => c.id === selectedCustomerId)!;
                  const site = sites.find((s) => s.id === customer.siteId);
                  return site ? <GuestSiteAccount key={'customer-account-' + customer.id + '-' + site.id}
                    site={site} customer={customer} readings={readings}
                    notices={noticeDrafts.filter((n) => n.siteId === site.id && n.customerId === customer.id)}
                    paid={rentPaid(customer.id)} today={todayAtPark}
                    onRecordSamplePayment={recordSampleRent} onDraft={prepareSampleNotice}
                    onGoMeters={() => openMeterForSite(site.id)}/> : null;
                })()}
              <section className="demo-panel">
                <div className="demo-section-head"><div><h2>Customer directory</h2><p>{customers.length.toLocaleString()} fictional customer files with optional contacts, arrival details, vehicle notes and deposits. Lists display 50 at a time.</p></div>
                  <label className="demo-filter" htmlFor="demo-customer-search">Search
                    <input id="demo-customer-search" placeholder="Name or site" value={customerQuery} onChange={(e) => {setCustomerQuery(e.target.value); setCustomerPage(0);}}/>
                  </label>
                </div>
                <div className="demo-table-wrap"><table className="demo-table"><thead><tr><th>Customer</th><th>Site</th><th>Monthly rent</th><th>Occupancy</th><th>Pets</th><th>Extended visitors</th><th>Record</th></tr></thead><tbody>{filteredCustomers.slice(visibleCustomerPage * 50, visibleCustomerPage * 50 + 50).map((customer) => {
                  const site = sites.find((s) => s.id === customer.siteId);
                  return <tr key={customer.id}><td>{customer.name}</td><td>{customer.siteId ?? 'Not assigned'}</td><td>{site ? money(site.rent) : '—'}</td><td><span className={'demo-status ' + (site ? 'occupied' : 'reserved')}>{site ? 'Current resident' : 'Waiting / past guest'}</span></td>
                  <td>{Object.values(customer.pets??{}).reduce((sum,count)=>sum+count,0)} animals</td><td>{(customer.guestVisits??[]).filter((visit)=>(Date.parse(visit.departure+'T00:00:00Z')-Date.parse(visit.arrival+'T00:00:00Z'))/86400000>14).length} over 14 days</td><td><button className="demo-small-button" type="button" aria-label={'Edit customer ' + customer.name} onClick={() => setSelectedCustomerId(customer.id)}>View / edit</button></td></tr>;
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
              <div className="demo-section-head"><div><h2><Boxes size={19}/> Inventory & supplies</h2><p>Add your own supplies to this fictional demo stockroom, then practice receiving them. Saved on this device only, not in real company records. Reset Demo clears the saved list.</p></div><span className="demo-property-pill">{stock.length} inventory items</span></div>
              <form className="demo-work" onSubmit={(event) => {
                event.preventDefault();
                const name = newStockName.trim();
                const quantity = Number(newStockQuantity);
                const unit = newStockUnit.trim();
                const barcode = newStockBarcode.trim();
                const unitsPerCase = Number(newStockCaseSize);
                if (!name || !unit || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000 || !Number.isSafeInteger(unitsPerCase) || unitsPerCase < 1 || unitsPerCase > 1000000 || (barcode.length>0 && !/^[A-Za-z0-9-]{4,64}$/.test(barcode))) {
                  setNotice('Enter a name, unit, quantity from 0 to 1,000,000, valid units per case, and an optional barcode of 4–64 letters, digits or hyphens.');
                  return;
                }
                if (stock.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                  setNotice('That item already exists. Use Receive +1 on its inventory row.');
                  return;
                }
                if (barcode && stock.some((item) => item.barcode === barcode)) {setNotice('This barcode is already assigned to another inventory item.'); return;}
                setStock((items) => [...items, {name, quantity, unit, barcode, unitsPerCase}]);
                setNewStockName('');
                setNewStockQuantity('0');
                setNewStockBarcode('');
                setNewStockCaseSize('1');
                setNotice('Added ' + name + ' to this fictional inventory list.');
              }}>
                <div><label htmlFor="demo-stock-name">Item name</label><input id="demo-stock-name" value={newStockName} onChange={(event) => setNewStockName(event.target.value)} placeholder="e.g. Sprinkler heads" maxLength={100} required/></div>
                <div><label htmlFor="demo-stock-quantity">Starting quantity</label><input id="demo-stock-quantity" type="number" min="0" max="1000000" step="1" value={newStockQuantity} onChange={(event) => setNewStockQuantity(event.target.value)} required/></div>
                <div><label htmlFor="demo-stock-unit">Unit</label><input id="demo-stock-unit" value={newStockUnit} onChange={(event) => setNewStockUnit(event.target.value)} placeholder="pieces, boxes, gallons" maxLength={40} required/></div>
                <div><label htmlFor="demo-stock-barcode">Product barcode (optional)</label><input id="demo-stock-barcode" value={newStockBarcode} onChange={(event)=>setNewStockBarcode(event.target.value)} placeholder="Scan here or type barcode" maxLength={64}/></div>
                <div><label htmlFor="demo-stock-case-size">Units per case</label><input id="demo-stock-case-size" type="number" min="1" max="1000000" step="1" value={newStockCaseSize} onChange={(event)=>setNewStockCaseSize(event.target.value)} required/></div>
                <button type="submit"><Plus size={16}/> Add inventory item</button>
              </form>
              <form className="demo-work" onSubmit={(event)=>{
                event.preventDefault();
                const code=scanBarcode.trim();
                const cases=Number(scanCases);
                const item=stock.find((entry)=>entry.barcode===code && code.length>0);
                if(!item){setNotice('Barcode not found. Add the product and barcode to inventory first.');return;}
                const perCase=item.unitsPerCase??1;
                const change=cases*perCase;
                if(!Number.isSafeInteger(cases)||cases<1||cases>1000000||!Number.isSafeInteger(change)||change>1000000){setNotice('Enter a valid whole-number case count.');return;}
                if(scanAction==='use'&&change>item.quantity){setNotice('Not enough stock for that many cases of '+item.name+'.');return;}
                if(scanAction==='receive'&&item.quantity+change>1000000){setNotice('Receiving those cases exceeds the demo inventory limit.');return;}
                setStock((items)=>items.map((entry)=>entry.name===item.name?{...entry,quantity:entry.quantity+(scanAction==='receive'?change:-change)}:entry));
                setNotice((scanAction==='receive'?'Received ':'Used ')+cases+' case(s) of '+item.name+' ('+change+' '+item.unit+').');
                setScanBarcode('');
              }}>
                <div><strong>Barcode scanner — receive or use stock</strong><p>Scan with a USB/Bluetooth scanner or type the barcode, then press Enter. Each case changes stock by its saved units-per-case value.</p></div>
                <div><label htmlFor="demo-scan-code">Scan product barcode</label><input id="demo-scan-code" value={scanBarcode} onChange={(event)=>setScanBarcode(event.target.value)} placeholder="Scan or type barcode" required/></div>
                <div><label htmlFor="demo-scan-action">Stock movement</label><select id="demo-scan-action" value={scanAction} onChange={(event)=>setScanAction(event.target.value as 'receive'|'use')}><option value="receive">Receive cases (+)</option><option value="use">Use cases (−)</option></select></div>
                <div><label htmlFor="demo-scan-cases">Number of cases</label><input id="demo-scan-cases" type="number" min="1" step="1" max="1000000" value={scanCases} onChange={(event)=>setScanCases(event.target.value)} required/></div>
                <button type="submit">Update inventory by barcode</button>
              </form>
              {editingStockName!==null && <form className="demo-work" aria-label="Edit inventory item" onSubmit={(event)=>{
                event.preventDefault();
                const current=stock.find((entry)=>entry.name===editingStockName);
                const name=stockEdit.name.trim();
                const unit=stockEdit.unit.trim();
                const barcode=stockEdit.barcode.trim();
                const quantity=Number(stockEdit.quantity);
                const unitsPerCase=Number(stockEdit.unitsPerCase);
                if(!current){setEditingStockName(null);return;}
                if(!name||!unit||!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000||
                  !Number.isSafeInteger(unitsPerCase)||unitsPerCase<1||unitsPerCase>1000000||
                  (barcode.length>0&&!/^[A-Za-z0-9-]{4,64}$/.test(barcode))){
                  setNotice('Enter a valid name, unit, barcode, quantity, and case size.');return;
                }
                if(stock.some((entry)=>entry.name!==editingStockName&&entry.name.toLocaleLowerCase()===name.toLocaleLowerCase())){
                  setNotice('Another inventory item already has that name.');return;
                }
                if(barcode&&stock.some((entry)=>entry.name!==editingStockName&&entry.barcode===barcode)){
                  setNotice('That barcode is already assigned to another item.');return;
                }
                setStock((items)=>items.map((entry)=>entry.name===editingStockName?{name,quantity,unit,barcode,unitsPerCase}:entry));
                setEditingStockName(null);
                setNotice('Updated fictional inventory item '+name+'.');
              }}>
                <strong>Edit {editingStockName}</strong>
                <div><label htmlFor="demo-edit-stock-name">Item name</label><input id="demo-edit-stock-name" value={stockEdit.name} maxLength={100} required onChange={(event)=>setStockEdit((old)=>({...old,name:event.target.value}))}/></div>
                <div><label htmlFor="demo-edit-stock-quantity">Quantity in individual units</label><input id="demo-edit-stock-quantity" type="number" min="0" max="1000000" step="1" required value={stockEdit.quantity} onChange={(event)=>setStockEdit((old)=>({...old,quantity:event.target.value}))}/></div>
                <div><label htmlFor="demo-edit-stock-unit">Unit</label><input id="demo-edit-stock-unit" maxLength={40} required value={stockEdit.unit} onChange={(event)=>setStockEdit((old)=>({...old,unit:event.target.value}))}/></div>
                <div><label htmlFor="demo-edit-stock-barcode">Barcode</label><input id="demo-edit-stock-barcode" maxLength={64} value={stockEdit.barcode} onChange={(event)=>setStockEdit((old)=>({...old,barcode:event.target.value}))}/></div>
                <div><label htmlFor="demo-edit-stock-case-size">Units per case</label><input id="demo-edit-stock-case-size" type="number" min="1" max="1000000" step="1" required value={stockEdit.unitsPerCase} onChange={(event)=>setStockEdit((old)=>({...old,unitsPerCase:event.target.value}))}/></div>
                <button type="submit">Save inventory changes</button>
                <button type="button" onClick={()=>setEditingStockName(null)}>Cancel edit</button>
              </form>}
              <label htmlFor="demo-stock-search">Find inventory item</label>
              <input id="demo-stock-search" type="search" value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Search your supply list"/>
              <p className="demo-property-pill">Showing {stock.filter((item) => item.name.toLocaleLowerCase().includes(stockSearch.trim().toLocaleLowerCase())).length} of {stock.length} items</p>
              <div className="demo-work-list">{stock.filter((item) => item.name.toLocaleLowerCase().includes(stockSearch.trim().toLocaleLowerCase())).map((item) => <article key={item.name} className="demo-work"><span className="demo-task-icon"><Boxes size={20}/></span><div><strong>{item.name}</strong><small>{item.quantity} {item.unit} in stock · {Math.floor(item.quantity/(item.unitsPerCase??1))} full cases ({item.unitsPerCase??1} {item.unit}/case){item.barcode?' · Barcode: '+item.barcode:''}</small></div><button type="button" onClick={()=>{setEditingStockName(item.name);setStockEdit({name:item.name,quantity:String(item.quantity),unit:item.unit,barcode:item.barcode??'',unitsPerCase:String(item.unitsPerCase??1)});}}>Edit item</button><button type="button" onClick={() => {setStock((old) => old.map((s) => s.name === item.name ? {...s, quantity: Math.min(1000000, s.quantity + 1)} : s)); setNotice('Received one fictional ' + item.unit + ' into the sample stockroom.');}} disabled={item.quantity>=1000000}>Receive +1</button><button type="button" disabled={item.quantity===0} onClick={() => {setStock((old) => old.map((s) => s.name === item.name ? {...s, quantity: Math.max(0, s.quantity - 1)} : s)); setNotice('Used one fictional ' + item.unit + ' from the sample stockroom.');}}>Use −1</button>{!initialStock().some((sample) => sample.name === item.name) && <button type="button" aria-label={'Remove custom inventory item ' + item.name} onClick={() => {setStock((items) => items.filter((entry) => entry.name !== item.name)); if(editingStockName===item.name)setEditingStockName(null); setNotice('Removed the fictional inventory item ' + item.name + '.');}}>Remove item</button>}</article>)}</div>
              {stock.length>0&&stock.filter((item) => item.name.toLocaleLowerCase().includes(stockSearch.trim().toLocaleLowerCase())).length===0&&<p>No supplies match that search. Clear the search to see the whole inventory list.</p>}
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

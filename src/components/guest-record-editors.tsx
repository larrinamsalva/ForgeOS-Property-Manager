'use client';

import { useState, type FormEvent } from 'react';
import { Building2, Save, UserRound, X } from 'lucide-react';

export type DemoKind = 'rv' | 'apartment' | 'cabin' | 'tent' | 'house' | 'commercial';
export type UnitDesignation = 'site' | 'space' | 'apartment' | 'mobile' | 'campground';
export const unitDesignations: { value: UnitDesignation; label: string }[] = [
  { value: 'site', label: 'Site' },
  { value: 'space', label: 'Space' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'mobile', label: 'Mobile Home' },
  { value: 'campground', label: 'Campground' },
];
export const designationLabel = (value: UnitDesignation) =>
  unitDesignations.find((designation) => designation.value === value)?.label ?? 'Site';

export type DemoStatus = 'occupied' | 'available' | 'reserved';
export type DemoSite = {
  id: string;
  status: DemoStatus;
  resident: string;
  rent: number;
  kind: DemoKind;
  designation: UnitDesignation;
  label: string;
  section: string;
  lengthFt: number;
  widthFt: number;
  electric: boolean;
  water: boolean;
  sewer: boolean;
  gas: boolean;
  amperage: number;
  notes: string;
};
export type DemoCustomer = {
  id: number;
  name: string;
  siteId: string | null;
  phone: string;
  email: string;
  emergencyContact: string;
  vehicle: string;
  pets?: { dogs: number; cats: number; horses: number; cows: number };
  guestVisits?: { name: string; arrival: string; departure: string }[];
  arrivalDate: string;
  deposit: number;
  notes: string;
};

export const demoKinds: { value: DemoKind; label: string; prefix: string }[] = [
  { value: 'rv', label: 'RV space', prefix: 'RV' },
  { value: 'apartment', label: 'Apartment', prefix: 'APT' },
  { value: 'cabin', label: 'Cabin', prefix: 'CAB' },
  { value: 'tent', label: 'Tent campsite', prefix: 'TENT' },
  { value: 'house', label: 'House', prefix: 'HOUSE' },
  { value: 'commercial', label: 'Commercial unit', prefix: 'UNIT' },
];

export const kindLabel = (kind: DemoKind) => demoKinds.find((item) => item.value === kind)?.label ?? 'Space';

export function makeDemoSite(id: string, kind: DemoKind = 'rv', status: DemoStatus = 'available', rent = 675): DemoSite {
  return {
    id, kind, designation: kind === 'apartment' ? 'apartment' : kind === 'house' ? 'mobile' : kind === 'tent' ? 'campground' : 'site',
    label: id, status, resident: '', rent, section: '',
    lengthFt: 0, widthFt: 0, electric: true, water: true, sewer: true, gas: false,
    amperage: 30, notes: '',
  };
}

export function makeDemoCustomer(id: number, name: string, siteId: string | null = null): DemoCustomer {
  return {
    id, name, siteId, phone: '', email: '', emergencyContact: '',
    vehicle: '', pets: {dogs:0,cats:0,horses:0,cows:0}, guestVisits: [], arrivalDate: '', deposit: 0, notes: '',
  };
}

function validName(v: string) { return v.trim().length > 0 && v.trim().length <= 100; }
function moneyOkay(v: number) { return Number.isFinite(v) && v >= 0 && v <= 10000000; }

// A sample unit has a stable internal ID (RV-88) and may have an independent
// display number/name (88, A-4, Lot 25). Never use a typed value as a new ID.
function unitNumber(site: DemoSite): string {
  const autoNumber = site.label === site.id && /^RV-(\d+)$/i.exec(site.id);
  return autoNumber ? String(Number(autoNumber[1])) : site.label;
}
function unitNumberMatches(site: DemoSite, typed: string): boolean {
  const text = typed.trim().toLowerCase().replace(
    /^(?:site|space|apartment|mobile home|campground)\s*(?:#|no\.?|number|:|-)?\s*/i, ''
  );
  if (!text) return false;
  const number = unitNumber(site).toLowerCase();
  return text === number || text === site.label.toLowerCase() || text === site.id.toLowerCase();
}

export function GuestSiteEditor({
  site, customer, onOpenCustomer, onSave, onClose,
}: {
  site: DemoSite;
  customer?: DemoCustomer;
  onOpenCustomer?: (id: number) => void;
  onSave: (updated: DemoSite) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DemoSite>(site);
  // Keep input text separate from saved numbers so deleting "0", or typing
  // a decimal point, never forces the old value back into the field.
  const [numberText, setNumberText] = useState({
    rent: String(site.rent),
    lengthFt: site.lengthFt === 0 ? '' : String(site.lengthFt),
    widthFt: site.widthFt === 0 ? '' : String(site.widthFt),
    amperage: site.amperage === 0 ? '' : String(site.amperage),
  });
  const [error, setError] = useState('');
  const edit = (fields: Partial<DemoSite>) => setDraft((current) => ({ ...current, ...fields }));
  const editNumber = (field: keyof typeof numberText, text: string) =>
    setNumberText((current) => ({ ...current, [field]: text }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rent = numberText.rent.trim() === '' ? NaN : Number(numberText.rent);
    const lengthFt = numberText.lengthFt.trim() === '' ? 0 : Number(numberText.lengthFt);
    const widthFt = numberText.widthFt.trim() === '' ? 0 : Number(numberText.widthFt);
    const amperage = numberText.amperage.trim() === '' ? 0 : Number(numberText.amperage);
    if (!validName(draft.label) || !unitDesignations.some((option) => option.value === draft.designation) ||
      !moneyOkay(rent) ||
      ![lengthFt, widthFt, amperage].every((v) => Number.isFinite(v) && v >= 0 && v <= 100000) ||
      !Number.isInteger(amperage)) {
      setError('Enter a space name and valid nonnegative rates, dimensions and electrical capacity.');
      return;
    }
    if (customer && draft.status !== 'occupied') {
      setError('This space has an assigned customer. Move the customer to Waiting List or another vacant space before changing its availability.');
      return;
    }
    onSave({
      ...draft, rent, lengthFt, widthFt, amperage,
      id: site.id, status: customer ? 'occupied' : draft.status, resident: customer ? customer.name : '',
      label: draft.label.trim(), section: draft.section.trim(), notes: draft.notes.trim(),
    });
  }
  return <section className="demo-panel demo-record-editor" aria-label={'Edit space ' + site.id}>
    <div className="demo-section-head"><div><h2><Building2 size={19}/> Space / apartment record</h2><p>Editing <strong>{site.id}</strong> · Sample changes only · No real records saved</p></div>
      <button type="button" className="demo-small-button" onClick={onClose}><X size={15}/> Close</button>
    </div>
    <section className="demo-site-resident" aria-label={'Assigned customer for ' + site.id}>
      <div className="demo-site-resident-header">
        <strong>Customer on this space</strong>
        {customer && onOpenCustomer && <button type="button" className="demo-small-button" onClick={() => onOpenCustomer(customer.id)}>Open customer record</button>}
      </div>
      {customer ? <div className="demo-site-resident-grid">
        <div><small>Customer name</small><strong>{customer.name}</strong></div>
        <div><small>Phone</small><span>{customer.phone || 'Not provided'}</span></div>
        <div><small>Email</small><span>{customer.email || 'Not provided'}</span></div>
        <div><small>Move-in date</small><span>{customer.arrivalDate || 'Not entered'}</span></div>
        <div><small>Emergency contact</small><span>{customer.emergencyContact || 'Not provided'}</span></div>
        <div><small>Vehicle / RV</small><span>{customer.vehicle || 'Not entered'}</span></div>
        <div><small>Registered animals</small><span>{(['dogs','cats','horses','cows'] as const).map((animal)=>animal+': '+(customer.pets?.[animal]??0)).join(' · ')}</span></div>
        <div><small>Recorded visitors</small><span>{customer.guestVisits?.length??0} visitor records · {(customer.guestVisits??[]).filter((visit)=>(Date.parse(visit.departure+'T00:00:00Z')-Date.parse(visit.arrival+'T00:00:00Z'))/86400000>14).length} extended stays over 14 days</span></div>
        {customer.notes && <div className="demo-site-resident-notes"><small>Customer notes</small><span>{customer.notes}</span></div>}
      </div> : <p>{site.status === 'occupied'
        ? site.resident ? site.resident + ' — no linked customer information yet.' : 'Occupied — customer information not recorded.'
        : 'No current customer is assigned to this space.'}</p>}
      <small>Fictional demo records only · Updates follow the linked customer record.</small>
    </section>
    <form onSubmit={submit}>
      <div className="demo-record-grid">
        <label htmlFor="demo-space-designation">Unit type
          <select id="demo-space-designation" value={draft.designation} onChange={(e) => {
            const designation = e.target.value as UnitDesignation;
            edit({ designation, kind: designation === 'apartment' ? 'apartment' : designation === 'mobile' ? 'house' : designation === 'campground' ? 'tent' : 'rv' });
          }}>
            {unitDesignations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor="demo-space-label">Unit number or name
          <input id="demo-space-label" maxLength={100} required placeholder="Example: 12, A-4, or Lot 25" value={draft.label} onChange={(e) => edit({ label: e.target.value })}/>
        </label>
        <label htmlFor="demo-space-section">Area / building / row
          <input id="demo-space-section" maxLength={80} placeholder="Example: Building A, Row 2" value={draft.section} onChange={(e) => edit({ section: e.target.value })}/>
        </label>
        <label htmlFor="demo-space-rent">Monthly rent ($)
          <input id="demo-space-rent" type="number" min="0" max="10000000" step="0.01" required value={numberText.rent} onChange={(e) => editNumber('rent', e.target.value)}/>
        </label>
        <label htmlFor="demo-space-length">Length (feet)
          <input id="demo-space-length" type="number" min="0" max="100000" step="0.1" value={numberText.lengthFt} placeholder="Example: 40" onChange={(e) => editNumber('lengthFt', e.target.value)}/>
        </label>
        <label htmlFor="demo-space-width">Width (feet)
          <input id="demo-space-width" type="number" min="0" max="100000" step="0.1" value={numberText.widthFt} placeholder="Example: 12" onChange={(e) => editNumber('widthFt', e.target.value)}/>
        </label>
        <label htmlFor="demo-space-amps">Electrical service (amps)
          <input id="demo-space-amps" type="number" min="0" max="100000" step="1" value={numberText.amperage} onChange={(e) => editNumber('amperage', e.target.value)}/>
        </label>
        <label htmlFor="demo-space-status">Space availability
          <select id="demo-space-status" value={draft.status} onChange={(e) => edit({ status: e.target.value as DemoStatus })} disabled={!!customer}>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="occupied">Occupied</option>
          </select>
        </label>
        {customer && <p className="demo-record-meta">Assigned to {customer.name}. To make this space available, open the linked customer record and move the customer to Waiting List or another vacant space first.</p>}
        <label className="demo-record-meta">Saved occupancy
          <output>{site.status} {site.resident ? '· ' + site.resident : ''}</output>
        </label>
      </div>
      <fieldset className="demo-utility-set">
        <legend>Utilities and connections</legend>
        {(['electric','water','sewer','gas'] as const).map((key) => <label key={key}>
          <input type="checkbox" checked={draft[key]} onChange={(e) => edit({ [key]: e.target.checked })}/>
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </label>)}
      </fieldset>
      <label className="demo-record-full" htmlFor="demo-space-notes">Site information / notes
        <textarea id="demo-space-notes" rows={3} maxLength={2000} placeholder="Example: 50-amp upgrade planned, accessible entrance, gravel driveway" value={draft.notes} onChange={(e) => edit({ notes: e.target.value })}/>
      </label>
      {error && <p className="demo-record-error" role="alert">{error}</p>}
      <div className="demo-form-actions"><button className="demo-action" type="submit"><Save size={16}/> Save sample space</button>
        <button type="button" className="demo-small-button" onClick={onClose}>Cancel</button></div>
    </form>
  </section>;
}

export function GuestCustomerForm({
  customer, sites, onSave, onClose,
}: {
  customer?: DemoCustomer;
  sites: DemoSite[];
  onSave: (record: DemoCustomer) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState<DemoCustomer>(customer ?? makeDemoCustomer(0, ''));
  const [depositText, setDepositText] = useState(customer?.deposit ? String(customer.deposit) : '');
  const [guestName, setGuestName] = useState('');
  const [guestArrival, setGuestArrival] = useState('');
  const [guestDeparture, setGuestDeparture] = useState('');
  const [error, setError] = useState('');
  // Assigned and Waiting List are separate choices, not an empty option
  // bundled inside the site dropdown.
  const [placement, setPlacement] = useState<'assigned' | 'waiting'>(() =>
    customer && !customer.siteId ? 'waiting' : 'assigned'
  );
  const editing = !!customer;
  const fieldId = (name: string) => (editing ? 'demo-edit-customer-' : 'demo-new-customer-') + name;
  const edit = (fields: Partial<DemoCustomer>) => setDraft((current) => ({ ...current, ...fields }));
  // This selector filters the *entire property* inventory, never just the current
  // directory page, so even a 700+ unit property offers every unoccupied unit.
  const [unitFilter, setUnitFilter] = useState<UnitDesignation | 'all'>(() =>
    customer?.siteId ? sites.find((site) => site.id === customer.siteId)?.designation ?? 'all' : 'all'
  );
  const [browseOpen, setBrowseOpen] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [unitNumberText, setUnitNumberText] = useState(
    () => customer?.siteId ? unitNumber(sites.find((site) => site.id === customer.siteId) ?? makeDemoSite(customer.siteId)) : ''
  );
  // This is the actual full inventory, not the 60-per-page directory or the
  // separately configured *planned* capacity. Newly added units appear here.
  const availableAcrossProperty = sites.filter((site) => site.status === 'available');
  const browseMatches = availableAcrossProperty.filter((site) =>
    (designationLabel(site.designation) + ' ' + site.label + ' ' + site.id + ' ' + site.section)
      .toLowerCase().includes(availableSearch.toLowerCase().trim())
  );
  const unoccupiedSites = sites.filter((site) =>
    site.status !== 'occupied' || (editing && site.id === customer?.siteId)
  );
  const matchingSites = unoccupiedSites.filter((site) => unitFilter === 'all' || site.designation === unitFilter);
  const readySites = matchingSites.filter((site) => site.status === 'available' || (editing && site.id === customer?.siteId));
  // The assignment dropdown is for vacancies only. Existing customers may
  // retain their own assigned unit, but other occupied/held units never appear.
  const vacancyCount = readySites.filter((site) => site.status === 'available').length;
  const exactNumberMatches = unitNumberText.trim()
    ? readySites.filter((site) => unitNumberMatches(site, unitNumberText))
    : [];
  const selectedUnit = sites.find((site) => site.id === draft.siteId);
  function chooseUnit(siteId: string | null) {
    const selected = sites.find((site) => site.id === siteId);
    edit({ siteId: selected?.id ?? null });
    setUnitNumberText(selected ? unitNumber(selected) : '');
    setError('');
  }
  function choosePlacement(next: 'assigned' | 'waiting') {
    setPlacement(next);
    if (next === 'waiting') {
      // Moving to the waitlist releases the old site on save through the
      // existing saveCustomer flow; nothing is reserved or assigned here.
      chooseUnit(null);
      setBrowseOpen(false);
    }
    setError('');
  }
  function typeUnitNumber(text: string) {
    setUnitNumberText(text);
    const matches = readySites.filter((site) => unitNumberMatches(site, text));
    // Auto-link only one actual available unit. An ambiguous or nonexistent
    // number must not silently assign somebody else's space.
    edit({ siteId: matches.length === 1 ? matches[0].id : null });
    setError('');
  }
  function selectUnitFilter(next: UnitDesignation | 'all') {
    setUnitFilter(next);
    // Never submit a site hidden by a newly chosen type.
    if (draft.siteId && next !== 'all' && sites.find((site) => site.id === draft.siteId)?.designation !== next) {
      edit({ siteId: null });
    }
    if (unitNumberText.trim()) {
      const filtered = sites.filter((site) =>
        (next === 'all' || site.designation === next) &&
        (site.status === 'available' || (editing && site.id === customer?.siteId)) &&
        unitNumberMatches(site, unitNumberText)
      );
      edit({ siteId: filtered.length === 1 ? filtered[0].id : null });
    }
    setError('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deposit = depositText.trim() === '' ? 0 : Number(depositText);
    if (placement === 'assigned' && !draft.siteId && !unitNumberText.trim()) {
      setError('Choose an available site for Assigned, or select Waiting List.');
      return;
    }
    if (placement === 'assigned' && unitNumberText.trim() && !draft.siteId) {
      setError('Space or unit number not found among currently available units. Choose a matching unit from Assigned / Available, or add that unit first in Property layout.');
      return;
    }
    if (Object.values(draft.pets ?? {}).some((count) => !Number.isSafeInteger(count) || count < 0 || count > 100)) {
      setError('Pet counts must be whole numbers between 0 and 100.');return;
    }
    if (!validName(draft.name) || !moneyOkay(deposit) ||
      (placement === 'assigned' && draft.siteId && !readySites.some((s) => s.id === draft.siteId))) {
      setError('Enter a sample name, a valid deposit, and a space that is available.');
      return;
    }
    onSave({
      ...draft,
      siteId: placement === 'waiting' ? null : draft.siteId,
      deposit,
      id: customer?.id ?? 0,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      emergencyContact: draft.emergencyContact.trim(),
      vehicle: draft.vehicle.trim(),
      guestVisits: draft.guestVisits ?? [],
      pets: draft.pets ?? {dogs:0,cats:0,horses:0,cows:0},
      notes: draft.notes.trim(),
    });
    if (!editing) {
      setDraft(makeDemoCustomer(0, ''));
      setDepositText('');
      setUnitNumberText('');
      setPlacement('assigned');
    }
    setError('');
  }
  return <section className="demo-panel demo-record-editor" aria-label={editing ? 'Edit customer ' + customer.name : 'Add customer information'}>
    <div className="demo-section-head"><div><h2><UserRound size={19}/> {editing ? 'Customer record' : 'Add a customer'}</h2>
      <p>Use made-up information here. Real customer details belong in the secure owner account.</p></div>
      {editing && onClose && <button type="button" className="demo-small-button" onClick={onClose}><X size={15}/> Close</button>}
    </div>
    <form onSubmit={submit}>
      <div className="demo-record-grid">
        <label className="demo-customer-name" htmlFor={fieldId('name')}>{editing ? 'Customer name' : 'Fictional customer name'}
          <input id={fieldId('name')} required maxLength={100} placeholder="Example: Sample Guest" value={draft.name} onChange={(e) => edit({ name: e.target.value })}/>
        </label>
        <fieldset className="demo-customer-placement">
          <legend>Customer placement</legend>
          <div className="demo-customer-placement-options">
            <label>
              <input type="radio" name={fieldId('placement')} value="assigned"
                checked={placement === 'assigned'} onChange={() => choosePlacement('assigned')}/>
              Assigned
            </label>
            <label>
              <input type="radio" name={fieldId('placement')} value="waiting"
                checked={placement === 'waiting'} onChange={() => choosePlacement('waiting')}/>
              Waiting List
            </label>
          </div>
          <small>{placement === 'assigned'
            ? 'Choose a vacant site, space, apartment, mobile home or campground below.'
            : 'On the waiting list — no space is assigned or held.'}</small>
        </fieldset>
        {placement === 'assigned' && <>
        <label className="demo-assignment-field" htmlFor={fieldId('site')}>{editing ? 'Assigned / available unit' : 'Assign an available site (optional)'}
          <select id={fieldId('site')} value={draft.siteId ?? 'unassigned'} onChange={(e) => chooseUnit(e.target.value === 'unassigned' ? null : e.target.value)}>
            <option value="unassigned">Choose an available space</option>
            {readySites.map((site) => <option key={site.id} value={site.id}>{designationLabel(site.designation)} · {site.label} ({site.id}) — {site.id === customer?.siteId ? 'Currently assigned' : 'Available'}</option>)}
          </select>
          <small aria-live="polite">{vacancyCount} currently available {vacancyCount === 1 ? 'unit' : 'units'} in this selection. Only vacant spaces, apartments, mobile homes and campground sites are available to new customers.</small>
        </label>
        <div className="demo-customer-unit-pair">
          <label htmlFor={fieldId('type')}>Choose unit type
            <select id={fieldId('type')} value={unitFilter} onChange={(e) => selectUnitFilter(e.target.value as UnitDesignation | 'all')}>
              <option value="all">All types</option>
              {unitDesignations.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label htmlFor={fieldId('unit-number')}>Space / unit number
            <input id={fieldId('unit-number')} inputMode="text" maxLength={100}
              value={unitNumberText} placeholder="88 or A-4"
              onChange={(event) => typeUnitNumber(event.target.value)}/>
            <small aria-live="polite">{selectedUnit
              ? 'Selected: I live in ' + designationLabel(selectedUnit.designation) + ' ' + unitNumber(selectedUnit)
              : !unitNumberText.trim()
                ? 'Enter an existing available unit number, or choose it below.'
                : exactNumberMatches.length > 1
                  ? 'Multiple units share that number. Choose the exact one below.'
                  : 'No available unit matches that number and type. Choose an existing unit below or create it first.'}</small>
          </label>
        </div>

        <section className="demo-available-panel" aria-label="All available units">
          <div className="demo-available-header">
            <div>
              <strong>{availableAcrossProperty.length} available sites and units</strong>
              <small>From all {sites.length} created units in this property, including sites, spaces, apartments, mobile homes and campgrounds. Planned capacity is not yet-created inventory.</small>
            </div>
            <button type="button" className="demo-small-button" aria-expanded={browseOpen}
              aria-controls={fieldId('available-list')}
              onClick={() => setBrowseOpen((open) => !open)}>
              {browseOpen ? 'Hide available units' : 'Browse all available units'}
            </button>
          </div>
          {browseOpen && <div id={fieldId('available-list')} className="demo-available-browser">
            <label htmlFor={fieldId('available-search')}>Search all available sites and units
              <input id={fieldId('available-search')} type="search" value={availableSearch}
                placeholder="Search number, site name, type or section"
                onChange={(event) => setAvailableSearch(event.target.value)}/>
            </label>
            <p className="demo-available-match-count" aria-live="polite">
              {browseMatches.length} matching available {browseMatches.length === 1 ? 'unit' : 'units'} · Tap any unit to assign it.
            </p>
            <div className="demo-available-list" aria-label="Available units to assign">
              {browseMatches.map((site) => <button type="button" key={site.id}
                className="demo-available-item"
                aria-label={'Assign ' + designationLabel(site.designation) + ' ' + site.label + ' (' + site.id + ')'}
                onClick={() => {
                  setUnitFilter('all');
                  chooseUnit(site.id);
                }}>
                <span><strong>{designationLabel(site.designation)} · {site.label}</strong><small>{site.id}{site.section ? ' · ' + site.section : ''}</small></span>
                <span className="demo-available-choose">{draft.siteId === site.id ? 'Selected' : 'Select'}</span>
              </button>)}
              {!browseMatches.length && <p className="demo-available-empty">No available units match. Check another search or add more spaces in Property layout.</p>}
            </div>
          </div>}
        </section>
        </>}
        <label htmlFor={fieldId('phone')}>Phone number
          <input id={fieldId('phone')} type="tel" maxLength={40} placeholder="Sample only" value={draft.phone} onChange={(e) => edit({ phone: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('email')}>Email
          <input id={fieldId('email')} type="email" maxLength={150} placeholder="example@invalid.test" value={draft.email} onChange={(e) => edit({ email: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('emergency')}>Emergency contact
          <input id={fieldId('emergency')} maxLength={100} value={draft.emergencyContact} onChange={(e) => edit({ emergencyContact: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('vehicle')}>Vehicle / RV details
          <input id={fieldId('vehicle')} maxLength={160} placeholder="Example: Blue RV, sample plate" value={draft.vehicle} onChange={(e) => edit({ vehicle: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('arrival')}>Arrival / move-in date
          <input id={fieldId('arrival')} type="date" value={draft.arrivalDate} onChange={(e) => edit({ arrivalDate: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('deposit')}>Deposit amount ($)
          <input id={fieldId('deposit')} type="number" min="0" max="10000000" step="0.01" value={depositText} onChange={(e) => setDepositText(e.target.value)}/>
        </label>
      </div>
      <fieldset className="demo-utility-set">
        <legend>Animals registered with this customer</legend>
        {(['dogs','cats','horses','cows'] as const).map((animal)=><label key={animal} htmlFor={fieldId('pet-'+animal)}>
          {animal.charAt(0).toUpperCase()+animal.slice(1)}
          <input id={fieldId('pet-'+animal)} type="number" min="0" max="100" step="1" value={(draft.pets??{dogs:0,cats:0,horses:0,cows:0})[animal]}
            onChange={(event)=>edit({pets:{...({dogs:0,cats:0,horses:0,cows:0}),...draft.pets,[animal]:Number(event.target.value)}})}/>
        </label>)}
      </fieldset>
      <fieldset className="demo-utility-set">
        <legend>Overnight and extended visitors</legend>
        <p>Record expected visitor dates. Visits longer than 14 days are flagged for manager review; property policies may differ.</p>
        <label htmlFor={fieldId('guest-name')}>Visitor name
          <input id={fieldId('guest-name')} value={guestName} maxLength={100} onChange={(event)=>setGuestName(event.target.value)} placeholder="Example: Visiting family member"/>
        </label>
        <label htmlFor={fieldId('guest-arrival')}>Visitor arrival
          <input id={fieldId('guest-arrival')} type="date" value={guestArrival} onChange={(event)=>setGuestArrival(event.target.value)}/>
        </label>
        <label htmlFor={fieldId('guest-departure')}>Expected departure
          <input id={fieldId('guest-departure')} type="date" value={guestDeparture} onChange={(event)=>setGuestDeparture(event.target.value)}/>
        </label>
        <button type="button" className="demo-small-button" onClick={()=>{
          const days=(Date.parse(guestDeparture+'T00:00:00Z')-Date.parse(guestArrival+'T00:00:00Z'))/86400000;
          if(!validName(guestName)||!guestArrival||!guestDeparture||!Number.isFinite(days)||days<0){
            setError('Enter a visitor name and valid arrival/departure dates.');return;
          }
          edit({guestVisits:[...(draft.guestVisits??[]),{name:guestName.trim(),arrival:guestArrival,departure:guestDeparture}]});
          setGuestName('');setGuestArrival('');setGuestDeparture('');setError('');
        }}>Add visitor to customer record</button>
        {(draft.guestVisits??[]).map((visit,index)=>{
          const days=(Date.parse(visit.departure+'T00:00:00Z')-Date.parse(visit.arrival+'T00:00:00Z'))/86400000;
          return <div key={index}><strong>{visit.name}</strong> · {visit.arrival} to {visit.departure} · {days} days
            {days>14&&<strong> · Extended stay: manager review</strong>}
            <button type="button" className="demo-small-button" onClick={()=>edit({guestVisits:(draft.guestVisits??[]).filter((_,i)=>i!==index)})}>Remove visitor</button>
          </div>;
        })}
      </fieldset>
      <label className="demo-record-full" htmlFor={fieldId('notes')}>Additional notes / special requests
        <textarea id={fieldId('notes')} maxLength={2000} rows={3} value={draft.notes} onChange={(e) => edit({ notes: e.target.value })} placeholder="Example: Needs a pull-through space"/>
      </label>
      {error && <p role="alert" className="demo-record-error">{error}</p>}
      <div className="demo-form-actions"><button className="demo-action" type="submit"><Save size={16}/> {editing ? 'Save sample customer' : 'Add example customer'}</button>
        {editing && onClose && <button className="demo-small-button" type="button" onClick={onClose}>Cancel</button>}
      </div>
    </form>
  </section>;
}

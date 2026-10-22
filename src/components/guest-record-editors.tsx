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
    vehicle: '', arrivalDate: '', deposit: 0, notes: '',
  };
}

function validName(v: string) { return v.trim().length > 0 && v.trim().length <= 100; }
function moneyOkay(v: number) { return Number.isFinite(v) && v >= 0 && v <= 10000000; }

export function GuestSiteEditor({
  site, onSave, onClose,
}: { site: DemoSite; onSave: (updated: DemoSite) => void; onClose: () => void }) {
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
    onSave({
      ...draft, rent, lengthFt, widthFt, amperage,
      id: site.id, status: site.status, resident: site.resident,
      label: draft.label.trim(), section: draft.section.trim(), notes: draft.notes.trim(),
    });
  }
  return <section className="demo-panel demo-record-editor" aria-label={'Edit space ' + site.id}>
    <div className="demo-section-head"><div><h2><Building2 size={19}/> Space / apartment record</h2><p>Editing <strong>{site.id}</strong> · Sample changes only · No real records saved</p></div>
      <button type="button" className="demo-small-button" onClick={onClose}><X size={15}/> Close</button>
    </div>
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
        <label className="demo-record-meta">Current occupancy
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
  const [error, setError] = useState('');
  const editing = !!customer;
  const fieldId = (name: string) => (editing ? 'demo-edit-customer-' : 'demo-new-customer-') + name;
  const edit = (fields: Partial<DemoCustomer>) => setDraft((current) => ({ ...current, ...fields }));
  // This selector filters the *entire property* inventory, never just the current
  // directory page, so even a 700+ unit property offers every unoccupied unit.
  const [unitFilter, setUnitFilter] = useState<UnitDesignation | 'all'>(() =>
    customer?.siteId ? sites.find((site) => site.id === customer.siteId)?.designation ?? 'all' : 'all'
  );
  const unoccupiedSites = sites.filter((site) =>
    site.status !== 'occupied' || (editing && site.id === customer?.siteId)
  );
  const matchingSites = unoccupiedSites.filter((site) => unitFilter === 'all' || site.designation === unitFilter);
  const readySites = matchingSites.filter((site) => site.status === 'available' || (editing && site.id === customer?.siteId));
  const heldSites = matchingSites.filter((site) => site.status === 'reserved' && site.id !== customer?.siteId);
  function selectUnitFilter(next: UnitDesignation | 'all') {
    setUnitFilter(next);
    // Never submit a site hidden by a newly chosen type.
    if (draft.siteId && next !== 'all' && sites.find((site) => site.id === draft.siteId)?.designation !== next) {
      edit({ siteId: null });
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deposit = depositText.trim() === '' ? 0 : Number(depositText);
    if (!validName(draft.name) || !moneyOkay(deposit) ||
      (draft.siteId && !readySites.some((s) => s.id === draft.siteId))) {
      setError('Enter a sample name, a valid deposit, and a space that is available.');
      return;
    }
    onSave({
      ...draft,
      deposit,
      id: customer?.id ?? 0,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      emergencyContact: draft.emergencyContact.trim(),
      vehicle: draft.vehicle.trim(),
      notes: draft.notes.trim(),
    });
    if (!editing) {
      setDraft(makeDemoCustomer(0, ''));
      setDepositText('');
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
        <label htmlFor={fieldId('name')}>{editing ? 'Customer name' : 'Fictional customer name'}
          <input id={fieldId('name')} required maxLength={100} placeholder="Example: Sample Guest" value={draft.name} onChange={(e) => edit({ name: e.target.value })}/>
        </label>
        <label htmlFor={fieldId('type')}>Choose unit type
          <select id={fieldId('type')} value={unitFilter} onChange={(e) => selectUnitFilter(e.target.value as UnitDesignation | 'all')}>
            <option value="all">All sites, spaces, apartments, mobile homes &amp; campgrounds</option>
            {unitDesignations.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor={fieldId('site')}>{editing ? 'Assigned site (optional)' : 'Assign an available site (optional)'}
          <select id={fieldId('site')} value={draft.siteId ?? 'unassigned'} onChange={(e) => edit({ siteId: e.target.value === 'unassigned' ? null : e.target.value })}>
            <option value="unassigned">Waitlist / not assigned</option>
            {readySites.map((site) => <option key={site.id} value={site.id}>{designationLabel(site.designation)} · {site.label} ({site.id}) — {site.id === customer?.siteId ? 'Currently assigned' : 'Available'}</option>)}
            {heldSites.map((site) => <option key={site.id} value={site.id} disabled>{designationLabel(site.designation)} · {site.label} ({site.id}) — Reserved / held</option>)}
          </select>
          <small aria-live="polite">{readySites.length} available to assign · {heldSites.length} reserved (shown but not assignable) · {unoccupiedSites.length} total non-occupied units across the property.</small>
        </label>
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

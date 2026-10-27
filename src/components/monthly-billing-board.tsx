'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cents } from '@/lib/billing-domain';
import { customerName, dateAtProperty, type Snapshot } from '@/lib/domain';
import { invoiceStageLabel, type MonthlyInvoiceStage, type MonthlyRunRow, type MonthlyRunStatus } from '@/lib/monthly-billing-run';
import { monthlyBillingCsv } from '@/lib/monthly-billing-export';
import { filteredMeterActionCsv } from '@/lib/meter-action-export';
import { meterActions, filterMeterActionsByUtility, filterMeterTasksByDate, filterMeterTasksBySite, meterSiteTaskOptions, meterTaskDestination, sortMeterTasks, type MeterTaskSort, type MeterTaskDateFilter } from '@/lib/meter-actions';

const filters: {value:'all'|MonthlyRunStatus;label:string}[] = [
  {value:'all',label:'All intersecting stays'},
  {value:'ready',label:'Precheck clear'},
  {value:'review',label:'Needs review'},
  {value:'existing',label:'Existing invoices'},
];
const stages: {value:'all'|MonthlyInvoiceStage;label:string}[] = [
  {value:'all',label:'All invoice stages'},
  {value:'none',label:'No invoice yet'},
  {value:'draft',label:'Draft awaiting approval'},
  {value:'approved_unissued',label:'Approved, awaiting issuance'},
  {value:'issued',label:'Issued'},
  {value:'mixed',label:'Mixed invoice stages'},
];
export function MonthlyBillingBoard({
  snapshot, propertyId, month, onMonth, rows, loadingEvidence, evidenceError, navigationPending,
}: {
  snapshot: Snapshot;
  propertyId: string;
  month: string;
  onMonth: (value: string) => void;
  rows: MonthlyRunRow[];
  loadingEvidence: boolean;
  evidenceError: boolean;
  navigationPending: boolean;
}) {
  const [filter, setFilter] = useState<'all'|MonthlyRunStatus>('all');
  const [invoiceFilter, setInvoiceFilter] = useState<'all'|MonthlyInvoiceStage>('all');
  const [issueFilter, setIssueFilter] = useState<'all'|'readings'|'missing_capture'|'awaiting_review'|'rates'|'invoices'|'duplicates'|'policy'>('all');
  const [search,setSearch] = useState('');
  const [meterUtility,setMeterUtility] = useState<'all'|'electric'|'water'|'gas'>('all');
  const [meterAction,setMeterAction] = useState<'all'|'capture'|'review'|'inspect'>('all');
  const [meterSort,setMeterSort] = useState<MeterTaskSort>('site');
  const [meterDate,setMeterDate] = useState<MeterTaskDateFilter>('all');
  // A site selection belongs to one property and billing month only.
  const siteScope=propertyId+':'+month;
  const [meterSite,setMeterSite] = useState({scope:siteScope,siteId:'all'});
  const totals = {
    all:rows.length,ready:rows.filter(r=>r.status==='ready').length,
    review:rows.filter(r=>r.status==='review').length,
    existing:rows.filter(r=>r.status==='existing').length,
    draft:rows.filter(r=>r.invoices.some(i=>i.status==='draft' && !i.issued)).length,
    approved:rows.filter(r=>r.invoiceStage==='approved_unissued' ||
      (r.invoiceStage==='mixed' && r.invoices.some(i=>i.status==='approved' && !i.issued))).length,
    issued:rows.filter(r=>r.invoiceStage==='issued').length,
  };
  const issueGroups = [
    {value:'readings' as const,label:'Meter readings to review',count:rows.filter(r=>r.warnings.some(w=>w.includes('boundary readings') || w.includes('meter readings'))).length},
    {value:'missing_capture' as const,label:'Missing meter captures',count:rows.filter(r=>r.checklist.some(c=>c.label.includes('boundary readings')&&c.note.includes('missing capture'))).length},
    {value:'awaiting_review' as const,label:'Meter approvals needed',count:rows.filter(r=>r.checklist.some(c=>c.label.includes('boundary readings')&&c.note.includes('requires accepted review'))).length},
    {value:'rates' as const,label:'Missing rate schedules',count:rows.filter(r=>r.warnings.some(w=>w.includes('rate schedule'))).length},
    {value:'invoices' as const,label:'Existing invoice overlap',count:rows.filter(r=>r.warnings.includes('Existing invoices')).length},
    {value:'duplicates' as const,label:'Possible duplicate invoices',count:rows.filter(r=>r.warnings.some(w=>w.includes('Multiple overlapping invoices'))).length},
    {value:'policy' as const,label:'Billing policy checks',count:rows.filter(r=>r.warnings.includes('Property billing policy')).length},
  ];
  const matchesIssue = (row: MonthlyRunRow) => issueFilter === 'all' ||
    (issueFilter === 'readings' && row.warnings.some(w=>w.includes('boundary readings') || w.includes('meter readings'))) ||
    (issueFilter === 'missing_capture' && row.checklist.some(c=>c.label.includes('boundary readings')&&c.note.includes('missing capture'))) ||
    (issueFilter === 'awaiting_review' && row.checklist.some(c=>c.label.includes('boundary readings')&&c.note.includes('requires accepted review'))) ||
    (issueFilter === 'rates' && row.warnings.some(w=>w.includes('rate schedule'))) ||
    (issueFilter === 'invoices' && row.warnings.includes('Existing invoices')) ||
    (issueFilter === 'duplicates' && row.warnings.some(w=>w.includes('Multiple overlapping invoices'))) ||
    (issueFilter === 'policy' && row.warnings.includes('Property billing policy'));
  const names = new Map(snapshot.customers.filter(c => c.property_id === propertyId)
    .map(c => [c.id, customerName(c)]));
  function downloadChecklist() {
    const propertyName = snapshot.properties.find(p => p.id === propertyId)?.name ?? 'Property';
    const contents = monthlyBillingCsv(propertyName, month, visible, names);
    const url = URL.createObjectURL(new Blob([contents], {type:'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'forgeos-monthly-billing-' + month + '.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadMeterActions() {
    const propertyName = snapshot.properties.find(p => p.id === propertyId)?.name ?? 'Property';
    const contents = filteredMeterActionCsv(propertyName, month, tasks, visible);
    const url = URL.createObjectURL(new Blob([contents], {type:'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'forgeos-meter-actions-' + month + '.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visible = rows.filter(row => matchesIssue(row) && (filter === 'all' || row.status === filter) &&
    (invoiceFilter === 'all' ||
      (invoiceFilter === 'draft' && row.invoices.some(i=>i.status==='draft' && !i.issued)) ||
      (invoiceFilter === 'approved_unissued' && row.invoices.some(i=>i.status==='approved' && !i.issued)) ||
      (invoiceFilter !== 'draft' && invoiceFilter !== 'approved_unissued' && row.invoiceStage === invoiceFilter)) &&
    (row.siteLabel+' '+(names.get(row.customerId) ?? '')).toLowerCase()
      .includes(search.trim().toLowerCase()));
  const utilityTasks=filterMeterActionsByUtility(meterActions(visible),meterUtility);
  const propertyToday=dateAtProperty(snapshot.properties.find(p=>p.id===propertyId)?.timezone ?? 'America/Los_Angeles');
  const dateTasks=filterMeterTasksByDate(utilityTasks,meterDate,propertyToday);
  const actionTasks=dateTasks.filter(task=>meterAction==='all'||task.kind===meterAction);
  const meterSites=meterSiteTaskOptions(actionTasks,visible);
  const selectedMeterSite=meterSite.scope===siteScope && meterSites.some(site=>site.siteId===meterSite.siteId)
    ? meterSite.siteId : 'all';
  const tasks=sortMeterTasks(filterMeterTasksBySite(actionTasks,visible,selectedMeterSite),meterSort);
  const taskSites=new Map(visible.map(row=>[row.stayId,row.siteId]));
  return (
    <section className="panel monthly-billing-board" aria-label="Property monthly billing board">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Monthly run · Read-only preparation board</span>
          <h2>Every occupied site, one billing view</h2>
          <p className="muted">Select a billing month to review every stay intersecting that month—even if residents moved during it.</p>
        </div>
      </div>
      <div className="monthly-billing-controls">
        <label>Billing month
          <input aria-label="Billing month" type="month" value={month} min="2000-01" max="2100-12"
            disabled={navigationPending} onChange={e => onMonth(e.target.value)} />
        </label>
        <label>Find site or resident
          <input aria-label="Find billing site or resident" type="search" value={search}
            placeholder="Space 88 or resident name" onChange={e => setSearch(e.target.value)} />
        </label>
        <label>Show
          <select aria-label="Billing readiness filter" value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}>
            {filters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label>Invoice follow-up
          <select aria-label="Invoice follow-up filter" value={invoiceFilter}
            onChange={e => setInvoiceFilter(e.target.value as typeof invoiceFilter)}>
            {stages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          </select>
        </label>
      </div>
      <div className="monthly-billing-export">
        <button type="button" className="button secondary" disabled={navigationPending || !visible.length || loadingEvidence || evidenceError}
          onClick={downloadChecklist}>Download filtered billing checklist (CSV)</button>
        <button type="button" className="button secondary" disabled={navigationPending || !tasks.length || loadingEvidence || evidenceError}
          onClick={downloadMeterActions}>Download meter action list (CSV)</button>
        <p className="muted small">Billing checklist exports visible billing rows and private resident information. The meter action export matches the selected meter filters and contains no resident or invoice details.</p>
      </div>
      <section className="panel" aria-label="Meter action preview">
        <h3>Meter tasks for selected sites</h3>
        <p className="muted small">Read-only guidance from the billing precheck. Review and history links open the matching site and utility directly; the tablet reader still lets you select the assigned route. These links never record or approve a reading.</p>
        <label>Filter meter tasks by utility
          <select aria-label="Meter task utility filter" value={meterUtility} onChange={e=>{setMeterUtility(e.target.value as typeof meterUtility);setMeterSite({scope:siteScope,siteId:'all'});}}>
            <option value="all">All utilities</option><option value="electric">Electric</option><option value="water">Water</option><option value="gas">Gas</option>
          </select>
        </label>
        <label>Filter by task type
          <select aria-label="Meter task type filter" value={meterAction} onChange={e=>{setMeterAction(e.target.value as typeof meterAction);setMeterSite({scope:siteScope,siteId:'all'});}}>
            <option value="all">All actions</option><option value="capture">Capture readings</option><option value="review">Review approvals</option><option value="inspect">Other evidence checks</option>
          </select>
        </label>
        <label>Reading boundary date
          <select aria-label="Meter task boundary date filter" value={meterDate} onChange={e=>{setMeterDate(e.target.value as MeterTaskDateFilter);setMeterSite({scope:siteScope,siteId:'all'});}}>
            <option value="all">All boundary dates</option>
            <option value="before">Before today</option>
            <option value="today">Today</option>
            <option value="after">After today</option>
            <option value="undated">No boundary date recorded</option>
          </select>
        </label>
        <label>Focus on one site
          <select aria-label="Meter task site filter" value={selectedMeterSite} onChange={e=>setMeterSite({scope:siteScope,siteId:e.target.value})}>
            <option value="all">All sites ({meterSites.length})</option>
            {meterSites.map(site=><option key={site.siteId} value={site.siteId}>{site.label} ({site.count} tasks)</option>)}
          </select>
        </label>
        <label>Sort meter tasks
          <select aria-label="Meter task sort order" value={meterSort} onChange={e=>setMeterSort(e.target.value as MeterTaskSort)}>
            <option value="site">Site number</option><option value="boundary">Boundary date (earliest first)</option>
            <option value="utility">Utility</option><option value="action">Action type</option>
          </select>
        </label>
        <div className="action-group">
          <button type="button" className="button secondary small" disabled={navigationPending} onClick={()=>{
            setMeterUtility('all');setMeterAction('all');setMeterDate('all');setMeterSort('site');setMeterSite({scope:siteScope,siteId:'all'});
          }}>Reset meter task filters</button>
        </div>
        <p className="muted small">Date groups use the property local date ({propertyToday}); a past reading boundary is not a payment deadline.</p>
        {loadingEvidence || evidenceError ? <p role="status">{loadingEvidence?'Loading meter evidence…':'Meter evidence unavailable; action preview may be incomplete.'}</p>:
          <>
            <div className="monthly-billing-counts" aria-label="Visible meter task counts">
              <span><strong>{dateTasks.filter(t=>t.kind==='capture').length}</strong> readings to capture</span>
              <span><strong>{dateTasks.filter(t=>t.kind==='review').length}</strong> readings to review</span>
              <span><strong>{dateTasks.filter(t=>t.kind==='inspect').length}</strong> other evidence checks</span>
            </div>
            <p className="muted small">Showing {tasks.length} of {actionTasks.length} meter tasks across {meterSites.length} site(s) matching the current utility, action and date filters. The CSV includes only the {tasks.length} tasks shown below, in the same order.</p>
            {!tasks.length?<p>No meter evidence tasks match the selected property, site, utility, action and date filters.</p>:
              <div className="table-wrap" role="region" aria-label="Meter capture and approval action list" tabIndex={0}>
                <table><thead><tr><th scope="col">Site</th><th scope="col">Utility</th><th scope="col">Action</th><th scope="col">Details</th><th scope="col">Next step</th></tr></thead>
                  <tbody>{tasks.map(task=>{
                    const target=meterTaskDestination(task.kind,snapshot.organizationId,propertyId,taskSites.get(task.key.split(':')[0]),task.utility);
                    return <tr key={task.key}>
                    <th scope="row">{task.siteLabel}</th><td>{task.utility}</td>
                    <td>{task.kind==='capture'?'Capture':task.kind==='review'?'Review approval':'Inspect evidence'}</td>
                    <td>{task.detail}</td>
                    <td><Link className="button secondary small" href={target.href}>{target.label}</Link></td>
                  </tr>;
                  })}</tbody>
                </table>
              </div>}
          </>}
      </section>
      <section aria-label="Billing readiness attention" className="panel">
        <h3>Billing readiness attention</h3>
        <p className="muted small">Counts are advisory checks for this month, not invoices or automatic billing approvals. A stay can appear in more than one category.</p>
        <div className="quick-actions" role="group" aria-label="Filter billing issues">
          <button type="button" className={`button ${issueFilter === 'all' ? 'primary' : 'secondary'}`}
            aria-pressed={issueFilter === 'all'} onClick={() => setIssueFilter('all')}>All sites ({rows.length})</button>
          {issueGroups.map(group => <button key={group.value} type="button"
            className={`button ${issueFilter === group.value ? 'primary' : 'secondary'}`}
            aria-pressed={issueFilter === group.value} onClick={() => {
              setFilter('all');
              setInvoiceFilter('all');
              setIssueFilter(group.value);
            }}>{group.label} ({group.count})</button>)}
        </div>
      </section>
      <div className="monthly-billing-counts" role="group" aria-label="Filter monthly billing overview">
        {([
          {value:'all',label:'Stays this month',count:totals.all},
          {value:'ready',label:'Precheck clear',count:totals.ready},
          {value:'review',label:'Needs review',count:totals.review},
          {value:'existing',label:'Have invoices',count:totals.existing},
        ] as const).map(card=><button key={card.value} type="button"
          className={`button ${filter===card.value && invoiceFilter==='all' && issueFilter==='all'?'primary':'secondary'}`}
          aria-pressed={filter===card.value && invoiceFilter==='all' && issueFilter==='all'}
          onClick={()=>{setFilter(card.value);setInvoiceFilter('all');setIssueFilter('all');}}>
          <strong>{card.count}</strong> {card.label}
        </button>)}
      </div>
      <div className="monthly-billing-counts" role="group" aria-label="Monthly billing status counts">
        <span><strong>{totals.all}</strong> stays</span>
        <span><strong>{totals.ready}</strong> precheck clear</span>
        <span><strong>{totals.review}</strong> need review</span>
        <span><strong>{totals.existing}</strong> have invoices</span>
        <span><strong>{totals.draft}</strong> drafts awaiting approval</span>
        <span><strong>{totals.approved}</strong> have approved, unissued bills</span>
        <span><strong>{totals.issued}</strong> issued bills only</span>
      </div>
      <p className="muted small">
        {loadingEvidence ? 'Loading supervisor-reviewed meter readings… ' : ''}
        {evidenceError ? 'Meter evidence unavailable. Review indicators may be incomplete. ' : ''}
        Invoice-stage counts describe recorded invoices, not whether all services have been billed.
        Precheck clear is not a guaranteed invoice. The authoritative calculator still requires
        complete, approved meter boundaries and applicable rate versions.
      </p>
      {!visible.length ? <p>No stays match this property, month and filter.</p> :
        <div className="table-wrap" role="region" aria-label="Monthly billing site table" tabIndex={0}>
          <table>
            <thead><tr>
              <th scope="col">Site / resident</th>
              <th scope="col">Billing period</th>
              <th scope="col">Precheck</th>
              <th scope="col">Invoices for this stay</th>
              <th scope="col">Next step</th>
            </tr></thead>
            <tbody>{visible.map(row => <tr key={row.stayId}>
              <th scope="row">
                <strong>{row.siteLabel}</strong>
                <small>{names.get(row.customerId) ?? 'Customer unavailable'}</small>
                <Link className="monthly-issue-link" href={'/customers?' + new URLSearchParams({
                  organization:snapshot.organizationId,property:propertyId,
                })}>Customer records</Link>
              </th>
              <td>{row.period.startsOn} → {row.period.endsOn}
                <small>Due {row.period.dueOn}</small></td>
              <td>
                <span className="billing-status">
                  {row.status === 'ready' ? 'Precheck clear'
                    : row.status === 'review' ? 'Needs review' : 'Existing invoice'}
                </span>
                {row.warnings.length>0 &&
                  <small>{row.warnings.slice(0,3).join('; ')}
                    {row.warnings.length>3 ? ' +' + (row.warnings.length-3) + ' more' : ''}</small>}
                {row.warnings.length>0 && <details className="monthly-billing-warnings">
                  <summary>Review {row.warnings.length} item(s)</summary>
                  {row.checklist.filter(i=>i.state==='check').map(i=>
                    <p key={i.label}><strong>{i.label}:</strong> {i.note}</p>)}
                </details>}
              </td>
              <td><strong>{invoiceStageLabel(row.invoiceStage)}</strong>
                {row.invoices.length ? row.invoices.map(invoice=>
                <div key={invoice.id}>
                  <Link href={'/invoices/'+invoice.id}>{invoice.number}</Link>
                  <small>{invoice.issued ? 'Issued' : invoice.status === 'approved' ? 'Approved, unissued' : 'Draft'}
                    {' · '}{invoice.totalCents!==null?cents(invoice.totalCents):'Total unavailable'}</small>
                </div>) : <span>Not prepared</span>}</td>
              <td>
                <Link className="button secondary small" href={'/billing?' + new URLSearchParams({
                  organization:snapshot.organizationId,property:propertyId,
                  site:row.siteId,stay:row.stayId,month,
                })}>{row.status === 'existing' ? 'Review site bills' : 'Review / prepare draft'}</Link>
                {row.invoices.some(invoice => invoice.status === 'approved' && !invoice.issued) && (
                  <Link className="monthly-issue-link" href={'/collections?' + new URLSearchParams({
                    organization:snapshot.organizationId,property:propertyId,
                  })}>Open collections for manual issuance</Link>
                )}
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="muted small">Nothing on this board creates, approves, issues or collects a charge.
        Enter a site to calculate a draft, then review and approve it. Customer issuance remains a separate action in Payments &amp; collections.</p>
    </section>
  );
}

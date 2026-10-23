'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cents } from '@/lib/billing-domain';
import { customerName, type Snapshot } from '@/lib/domain';
import type { MonthlyRunRow, MonthlyRunStatus } from '@/lib/monthly-billing-run';

const filters: {value:'all'|MonthlyRunStatus;label:string}[] = [
  {value:'all',label:'All occupied sites'},
  {value:'ready',label:'Precheck clear'},
  {value:'review',label:'Needs review'},
  {value:'existing',label:'Existing invoices'},
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
  const [search,setSearch] = useState('');
  const totals = {
    all:rows.length,ready:rows.filter(r=>r.status==='ready').length,
    review:rows.filter(r=>r.status==='review').length,
    existing:rows.filter(r=>r.status==='existing').length,
  };
  const names = new Map(snapshot.customers.filter(c => c.property_id === propertyId)
    .map(c => [c.id, customerName(c)]));
  const visible = rows.filter(row => (filter === 'all' || row.status === filter) &&
    (row.siteLabel+' '+(names.get(row.customerId) ?? '')).toLowerCase()
      .includes(search.trim().toLowerCase()));
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
      </div>
      <div className="monthly-billing-counts" role="group" aria-label="Monthly billing status counts">
        <span><strong>{totals.all}</strong> stays</span>
        <span><strong>{totals.ready}</strong> precheck clear</span>
        <span><strong>{totals.review}</strong> need review</span>
        <span><strong>{totals.existing}</strong> have invoices</span>
      </div>
      <p className="muted small">
        {loadingEvidence ? 'Loading supervisor-reviewed meter readings… ' : ''}
        {evidenceError ? 'Meter evidence unavailable. Review indicators may be incomplete. ' : ''}
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
              <td>{row.invoices.length ? row.invoices.map(invoice=>
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
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="muted small">Nothing on this board creates, approves, issues or collects a charge.
        Enter a site to calculate a draft, then review and approve it. Customer issuance remains a separate action in Payments &amp; collections.</p>
    </section>
  );
}

'use client';
import { preventiveReminders } from '@/lib/preventive-reminders';
import { maintenanceCloseoutQueue } from '@/lib/maintenance-closeout-queue';
import { filterMaintenanceWorklist, maintenanceMatchesTriage, type MaintenanceTriage } from '@/lib/maintenance-triage';
import { filterWorkOrdersBySite } from '@/lib/site-maintenance-focus';
import { lowStockInventory } from '@/lib/low-stock-inventory';
import { existingRestockRequests, existingRestockStatusText } from '@/lib/existing-restock-requests';
import { incomingDeliveryLines, filterIncomingDeliveries, incomingDeliveriesCsvRows, type IncomingDeliveryFilter } from '@/lib/incoming-deliveries';
import { incomingStockCoverage } from '@/lib/incoming-stock-coverage';
import { linkedWorkPartReview } from '@/lib/work-parts-request-review';
import {
 approvedRequestsWithoutLinkedOrders,linkedPurchaseReview,linkedPurchaseStageLabels,linkedOrderQuantityGap,linkedOrderQuantityExcess,hasInvalidRequestedQuantity,
} from '@/lib/approved-request-order-handoff';
import {
  purchaseRequestAttention,filterPurchaseRequestAttention,
  purchaseRequestAttentionCsvRows,purchaseRequestAttentionChoices,
  type PurchaseRequestAttentionFilter,
} from '@/lib/purchase-request-attention';
import { waitingPartsHandoff, waitingPartsReasonLabels } from '@/lib/waiting-parts-handoff';
import {
  filterWaitingPartsRows, waitingPartsFilterChoices, type WaitingPartsViewFilter,
} from '@/lib/waiting-parts-handoff-review';
import { maintenanceWaitingPartsWorklist } from '@/lib/maintenance-waiting-parts-worklist';
import { employeeChecklistProgress } from '@/lib/employee-checklist-progress';
import { propertyChecklistTemplates } from '@/lib/property-checklist-templates';
import { employeeTodayWork } from '@/lib/employee-today-work';
import { SupervisorReviewDashboard } from './supervisor-review-dashboard';
import { MaintenanceMonthCalendar } from './maintenance-month-calendar';
import { InspectionLocation } from './inspection-location';
import { useState } from 'react';
import { cents } from '@/lib/billing-domain';
import { customerName, csv } from '@/lib/domain';
import { opsLabel, quantity, checklistState, purchaseState } from '@/lib/operations-domain';
import { Empty } from '../workspace-parts';
import type { OpsUI } from './types';
import { InspectionRepairLinks } from './inspection-repair-links';
import { PurchasingExpenseSnapshot } from './purchasing-expense-snapshot';
const scoped = <T extends { property_id: string }>(ui: OpsUI, rows: T[]) =>
  rows.filter((r) => r.property_id === ui.propertyId);
const staffName = (ui: OpsUI, id: string | null) =>
  ui.data.staff.find((s) => s.user_id === id && s.property_id === ui.propertyId)?.name ??
  (id ? 'Assigned staff' : 'Unassigned');
function Action({
  children,
  click,
  disabled = false,
}: {
  children: React.ReactNode;
  click: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="button secondary" onClick={click} disabled={disabled}>
      {children}
    </button>
  );
}
export function WorkPanel({ ui, search, status, mineOnly = false, onStatusChange, siteId = '', triage = 'all', onTriageChange }: {
  ui: OpsUI; search: string; status: string; mineOnly?: boolean;
  onStatusChange?: (value: string) => void; siteId?: string;
  triage?: MaintenanceTriage; onTriageChange?: (value: MaintenanceTriage) => void;
}) {
  const [partsBlocker,setPartsBlocker]=useState<WaitingPartsViewFilter>('all');
  const siteWork = filterWorkOrdersBySite(scoped(ui, ui.data.work),siteId);
  const work = filterMaintenanceWorklist(siteWork,{
    propertyId:ui.propertyId,siteId,search,status,mineOnly,
    userId:ui.snapshot.userId,today:ui.today,triage,
  });
  const inWaitingReview=triage==='waiting_parts'||status==='waiting_parts';
  const propertyTimezone=ui.snapshot.properties.find(p=>p.id===ui.propertyId)?.timezone??'America/Los_Angeles';
  const waitingQueue=inWaitingReview?waitingPartsHandoff(
    siteWork,ui.data.requests,ui.data.items,ui.data.summary.stock,
    ui.data.orders,ui.data.lines,ui.data.summary.purchase_lines,
    [{id:ui.propertyId,timezone:propertyTimezone}],new Date(),Number.MAX_SAFE_INTEGER,
  ).rows:[];
  const eligibleWaitingRows=waitingQueue.filter(row=>
    !mineOnly||row.work.assigned_to===ui.snapshot.userId);
  const visibleWork=inWaitingReview
    ?maintenanceWaitingPartsWorklist(work,eligibleWaitingRows,partsBlocker):work;
  const reasonByWork=new Map(eligibleWaitingRows.map(row=>[row.work.id,row]));
  const activeWork = siteWork.filter((w) =>
    !['completed', 'closed', 'cancelled'].includes(w.status) &&
    (!mineOnly || w.assigned_to === ui.snapshot.userId));
  const urgentCount = activeWork.filter((w) => w.priority === 'urgent').length;
  const overdueCount = activeWork.filter((w) => w.due_on && w.due_on < ui.today).length;
  const awaitingParts = activeWork.filter((w) => w.status === 'waiting_parts').length;
  const unassignedCount = activeWork.filter((w) => !w.assigned_to).length;
  const completedCount = siteWork.filter(w => w.status === 'completed' && (!mineOnly || w.assigned_to === ui.snapshot.userId)).length;
  const boardGroups = [
    { value: 'all', label: 'All jobs', count: siteWork.filter(w => !mineOnly || w.assigned_to === ui.snapshot.userId).length },
    { value: 'new', label: 'New', count: activeWork.filter(w => w.status === 'new').length },
    { value: 'in_progress', label: 'In progress', count: activeWork.filter(w => w.status === 'in_progress').length },
    { value: 'waiting_parts', label: 'Waiting for parts', count: awaitingParts },
    { value: 'completed', label: 'Awaiting closeout', count: completedCount },
    { value: 'closed', label: 'Closed', count: siteWork.filter(w => w.status === 'closed' && (!mineOnly || w.assigned_to === ui.snapshot.userId)).length },
  ];
  const closeout = maintenanceCloseoutQueue(siteWork,ui.data.photos,ui.data.events,ui.propertyId,ui.today);
  const todayDue = activeWork.filter(w => w.due_on === ui.today).length;
  const futureDue = activeWork.filter(w => !!w.due_on && w.due_on > ui.today).length;
  const noDueDate = activeWork.filter(w => !w.due_on).length;
  const workload = Array.from(
    activeWork.reduce((groups, w) => {
      const key = w.assigned_to ?? 'unassigned';
      const entry = groups.get(key) ?? { id: key, open: 0, urgent: 0, overdue: 0 };
      entry.open++;
      if (w.priority === 'urgent') entry.urgent++;
      if (w.due_on && w.due_on < ui.today) entry.overdue++;
      groups.set(key, entry);
      return groups;
    }, new Map<string, { id: string; open: number; urgent: number; overdue: number }>())
    .values()
  ).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.id.localeCompare(b.id));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{mineOnly ? 'My service · assigned jobs' : 'Maintenance requests & work orders'}</h2>
          <p>{mineOnly ? 'Open your work order to start service, add time, list parts, upload photos or mark it complete.' :
            'Track plumbing, sprinklers, tree trimming, bathrooms, laundry, trash areas and more.'}</p>
        </div>
        <div className="action-group">
          {ui.office && ui.active && <Action click={() => ui.open('new_work',undefined,undefined,siteId || undefined)}>New maintenance request</Action>}
          {!ui.office && ui.active && <Action click={() => ui.open('maintenance_self_task',undefined,undefined,siteId || undefined)}>Create my task</Action>}
        </div>
      </div>
      {!mineOnly && onStatusChange && (
        <div className="quick-actions" role="group" aria-label="Maintenance workflow filters">
          {boardGroups.map(group => (
            <button key={group.value} type="button"
              className={`button ${status === group.value ? 'primary' : 'secondary'}`}
              aria-pressed={status === group.value}
              onClick={() => {onStatusChange(group.value);setPartsBlocker('all');}}>
              {group.label} ({group.count})
            </button>
          ))}
        </div>
      )}
      {onTriageChange && <div className="quick-actions" role="group" aria-label="Maintenance attention filters">
        {([
          ['all','All work'],
          ['urgent','Urgent'],
          ['overdue','Overdue'],
          ['due_today','Due today'],
          ['waiting_parts','Waiting for parts'],
          ...(!mineOnly ? [['unassigned','Unassigned']] : []),
        ] as [MaintenanceTriage,string][]).map(([key,label])=>{
          const eligible = siteWork.filter(w=>!mineOnly||w.assigned_to===ui.snapshot.userId);
          const count = eligible.filter(w=>maintenanceMatchesTriage(w,key,ui.today)).length;
          return <button key={key} type="button" className={`button ${triage===key?'primary':'secondary'}`}
            aria-pressed={triage===key} onClick={()=>{onTriageChange(key);setPartsBlocker('all');}}>
            {label} ({count})
          </button>;
        })}
      </div>}
      {inWaitingReview && (
        <div className="ops-record" aria-label="Waiting repairs procurement blockers">
          <h3>Waiting-for-parts follow-up</h3>
          <p>Filter by the verified reason a repair needs purchasing follow-up or the local needed-by
            deadline on an active parts request. Only this property&apos;s waiting repairs and structured
            request-to-order links are included. On-hand stock is not reserved for jobs.</p>
          <div className="quick-actions" role="group" aria-label="Waiting parts blocker filters">
            {waitingPartsFilterChoices.map(choice=>(
              <button key={choice.value} type="button"
                className={`button ${partsBlocker===choice.value?'primary':'secondary'}`}
                aria-pressed={partsBlocker===choice.value}
                onClick={()=>setPartsBlocker(choice.value)}>
                {choice.label} ({filterWaitingPartsRows(eligibleWaitingRows,choice.value,'','').length})
              </button>
            ))}
          </div>
          <p className="muted small" role="status">Showing {visibleWork.length} of {work.length}
            repairs matching the existing search, status and attention filters.
            Blocker counts above cover the current site or property before search.</p>
          <p className="muted small">A placed order is not proof of shipment, delivery or parts allocation.
            Open a repair to confirm the linked request and recorded stock before making changes.</p>
        </div>
      )}
      {triage!=='all' && !inWaitingReview && <p className="muted small" role="status">
        Showing {work.length} work orders matching the attention, work status and search filters.
        Attention counts above cover the selected site or property before search and work-status filters.
      </p>}
      <div className="stat-grid" aria-label="Open maintenance work summary">
        <div className="stat-card"><span>Urgent open jobs</span><strong>{urgentCount}</strong></div>
        <div className="stat-card"><span>Overdue open jobs</span><strong>{overdueCount}</strong></div>
        <div className="stat-card"><span>Waiting for parts</span><strong>{awaitingParts}</strong></div>
        {!mineOnly && <div className="stat-card"><span>Unassigned jobs</span><strong>{unassignedCount}</strong></div>}
      </div>
      {!mineOnly && ui.manage && <section className="ops-record" aria-label="Maintenance completion supervisor review">
        <h3>Supervisor maintenance closeout</h3>
        <p>Review completed repairs, saved work notes, and uploaded before-and-after photos before approving closure. Reopening and approval use existing work-order controls.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Awaiting approval</span><strong>{closeout.filter(row=>row.awaitingApproval).length}</strong></div>
          <div className="stat-card"><span>Closed repairs</span><strong>{closeout.filter(row=>!row.awaitingApproval).length}</strong></div>
          <div className="stat-card"><span>Finished today</span><strong>{closeout.filter(row=>row.completedToday).length}</strong></div>
        </div>
        {!closeout.length?<p>No completed maintenance jobs in this property&apos;s loaded records.</p>:
          <div className="table-wrap" role="region" aria-label="Maintenance approval and evidence" tabIndex={0}>
            <table><thead><tr><th>Repair</th><th>Review</th><th>Before / after photos</th><th>Notes</th><th>Details</th></tr></thead>
            <tbody>{closeout.slice(0,30).map(row=><tr key={row.work.id}>
              <th scope="row">{row.work.number} · {row.work.title}</th>
              <td>{row.awaitingApproval?'Awaiting supervisor approval':'Closed'}</td>
              <td>{row.before} / {row.after}</td><td>{row.notes}</td>
              <td><button type="button" className="button secondary" onClick={()=>ui.open('work_detail',row.work.id)}>Review repair</button></td>
            </tr>)}</tbody></table>
          </div>}
        <p>Photo counts indicate uploaded records, not verified repair quality. Closing a work order is separate from inspection recheck sign-off.</p>
      </section>}
      <p>Active jobs appear first: urgent, overdue, high priority, then others. Completed and closed jobs remain in history. Summary counts cover the selected site when filtered, otherwise the property, independently of search and status filters.</p>
      <div className="stat-grid" aria-label="Maintenance scheduling overview">
        <div className="stat-card"><span>Due today</span><strong>{todayDue}</strong></div>
        <div className="stat-card"><span>Due later</span><strong>{futureDue}</strong></div>
        <div className="stat-card"><span>No due date</span><strong>{noDueDate}</strong></div>
      </div>
      {!mineOnly && (
        <section aria-label="Maintenance employee workload">
          <h3>Employee workload</h3>
          <p>Open jobs by assigned employee, across all workflow filters for the selected site or property.</p>
          {workload.length === 0 ? <p>No open maintenance jobs.</p> : (
            <div className="table-wrap" role="region" aria-label="Maintenance workload by employee" tabIndex={0}>
              <table>
                <thead><tr><th>Assigned to</th><th>Open jobs</th><th>Urgent</th><th>Overdue</th></tr></thead>
                <tbody>
                  {workload.map(row => (
                    <tr key={row.id}>
                      <th scope="row">{row.id === 'unassigned' ? 'Unassigned' : staffName(ui, row.id)}</th>
                      <td>{row.open}</td><td>{row.urgent}</td><td>{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {!mineOnly && !siteId && <MaintenanceMonthCalendar ui={ui} />}
      {!visibleWork.length ? (
        <Empty title="No matching work orders">
          No repairs match these selections. Choose All work, change the work status or clear your search to see more results.
        </Empty>
      ) : (
        <div className="table-wrap" role="region" aria-label="Maintenance work orders" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Location / employee</th>
                <th>Priority / status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {visibleWork.map((w) => (
                <tr key={w.id}>
                  <th scope="row">
                    <button className="text-button" onClick={() => ui.open('work_detail', w.id)}>
                      {w.number}
                    </button>
                    <small>{w.title} · {w.category}</small>
                  </th>
                  <td>
                    {ui.data.context.work.find((c) => c.id === w.id)?.site_label ?? 'Property / common area'}
                    <small>{w.description.split('\n')[0].startsWith('Service area: ') ?
                      w.description.split('\n')[0] : 'Area not recorded'}</small>
                    <small>
                      {ui.data.context.work.find((c) => c.id === w.id)?.assigned_name ??
                        staffName(ui, w.assigned_to)}
                    </small>
                  </td>
                  <td>
                    <span className="badge" data-priority={w.priority}>
                      {opsLabel(w.priority)}
                    </span>
                    <small>{opsLabel(w.status)}</small>
                    {w.status==='waiting_parts'&&inWaitingReview&&reasonByWork.get(w.id)&&(
                      <>
                        <small><strong>{waitingPartsReasonLabels[reasonByWork.get(w.id)!.reason]}</strong></small>
                        <small>{reasonByWork.get(w.id)!.linkedRequestCount} recorded request(s) ·
                          {reasonByWork.get(w.id)!.outstandingPlacedOrderCount} placed order(s) awaiting receipt</small>
                        {reasonByWork.get(w.id)!.overdueRequestCount>0&&
                          <small className="ops-overdue">{reasonByWork.get(w.id)!.overdueRequestCount} active parts request(s) past needed date</small>}
                        {reasonByWork.get(w.id)!.dueTodayRequestCount>0&&
                          <small>{reasonByWork.get(w.id)!.dueTodayRequestCount} parts request(s) needed today</small>}
                        {reasonByWork.get(w.id)!.lateOrderCount>0&&
                          <small className="ops-overdue">{reasonByWork.get(w.id)!.lateOrderCount} placed order(s) past expected date</small>}
                        {reasonByWork.get(w.id)!.noEtaOrderCount>0&&
                          <small>{reasonByWork.get(w.id)!.noEtaOrderCount} placed order(s) missing ETA</small>}
                        <div className="action-group">
                          {ui.active && reasonByWork.get(w.id)!.reason==='no_structured_request'&&
                            <Action click={()=>ui.open('purchase_request',w.id)}>Request needed parts</Action>}
                          <Action click={()=>ui.open('work_detail',w.id)}>Review parts &amp; repair</Action>
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    {w.due_on ?? 'Not scheduled'}
                    {w.due_on &&
                      w.due_on < ui.today &&
                      !['closed', 'cancelled', 'completed'].includes(w.status) && (
                        <small className="ops-overdue">Overdue</small>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function WorkDetail({ ui, id }: { ui: OpsUI; id: string }) {
  const { data, open } = ui,
    w = data.work.find((w) => w.id === id);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'uploaded' | 'pending' | 'voided'>('all');
  const [view, setView] = useState<{ url: string; caption: string } | null>(null),
    [photoError, setPhotoError] = useState('');
  if (!w) return <p>Work order unavailable.</p>;
  const writable = ui.active && !['completed', 'closed', 'cancelled'].includes(w.status),
    cost = data.summary.work_costs.find((c) => c.id === w.id),
    materials = data.materials.filter((m) => m.work_order_id === id),
    events = data.events
      .filter((e) => e.work_order_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const workProperty=ui.snapshot.properties.find(p=>p.id===w.property_id);
  const outstandingSupplies=incomingDeliveryLines(
    data.orders,data.lines,data.summary.purchase_lines,
    [{id:w.property_id,timezone:workProperty?.timezone??'America/Los_Angeles'}],
  );
  const requestedParts=linkedWorkPartReview(w,data.requests,data.items,data.summary.stock,outstandingSupplies);
  const workPhotos = data.photos.filter(p => p.work_order_id === id);
  const visiblePhotos = workPhotos.filter(p => photoFilter === 'all' || p.status === photoFilter);
  async function showPhoto(photoId: string, caption: string) {
    setPhotoError('');
    try {
      const r = await fetch(`/api/operations/photo?id=${photoId}`, { cache: 'no-store' });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setView({ url: v.url, caption });
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Photo unavailable.');
    }
  }
  return (
    <>
      <p>
        <span className="badge">{opsLabel(w.status)}</span> · {opsLabel(w.priority)} · {w.category}
      </p>
      <p className="preserve-lines">{w.description}</p>
      <p>
        Requested {w.requested_on} · Due {w.due_on ?? 'Not scheduled'} ·{' '}
        {data.context.work.find((c) => c.id === id)?.site_label ?? 'Common area'} ·{' '}
        {data.context.work.find((c) => c.id === id)?.assigned_name ?? staffName(ui, w.assigned_to)}
      </p>
      {ui.office && w.customer_id && (
        <p>Customer: {customerName(ui.snapshot.customers.find((c) => c.id === w.customer_id))}</p>
      )}
      <p>Parts required: {w.parts_required || 'None noted'}</p>
      {w.completed_on && <p>Completed {w.completed_on}</p>}
      {w.closed_on && (
        <p>
          Manager approved {w.closed_on} · {w.approved_by}
        </p>
      )}
      <div className="action-group ops-actions">
        {ui.office && writable && (
          <Action click={() => open('edit_work', id)}>Edit assignment / schedule</Action>
        )}
        {writable && (
          <>
            <Action click={() => open('work_note', id)}>Add work note / time</Action>
            {w.status !== 'in_progress' && (
              <Action click={() => open('work_status', id, undefined, 'in_progress')}>
                Start / resume work
              </Action>
            )}
            {w.status !== 'waiting_parts' && (
              <Action click={() => open('work_status', id, undefined, 'waiting_parts')}>
                Waiting for parts
              </Action>
            )}
            <Action click={() => open('work_status', id, undefined, 'completed')}>Mark completed</Action>
            <Action click={() => open('use_material', id)}>Use materials</Action>
            <Action click={() => open('purchase_request', id)}>Request parts</Action>
            <Action click={() => open('photo', id)}>Add photograph</Action>
          </>
        )}
        {ui.manage && ui.active && w.status === 'completed' && (
          <Action click={() => open('work_status', id, undefined, 'closed')}>Approve & close</Action>
        )}
        {ui.active &&
          ((ui.office && ['completed', 'cancelled'].includes(w.status)) ||
            (ui.manage && w.status === 'closed')) && (
            <Action click={() => open('work_status', id, undefined, 'in_progress')}>Reopen work</Action>
          )}
        {ui.office && ui.active && !['closed', 'cancelled'].includes(w.status) && (
          <Action click={() => open('work_status', id, undefined, 'cancelled')}>Cancel work</Action>
        )}
      </div>
      {ui.office && (
        <>
          <h3>Estimated & actual cost</h3>
          <p>
            Latest estimate {cost?.estimate_cents ? cents(cost.estimate_cents) : 'Not recorded'} · Actual{' '}
            {cents(cost?.actual_cents ?? '0')}
          </p>
          <p>
            Actual includes recorded expenses and net material usage. These records do not bill tenants or
            move money.
          </p>
          {ui.active && !['closed', 'cancelled'].includes(w.status) && (
            <div className="action-group">
              <Action click={() => open('work_cost', id, undefined, 'estimate')}>Record estimate</Action>
              <Action click={() => open('work_cost', id, undefined, 'expense')}>Record actual expense</Action>
            </div>
          )}
          {data.costs
            .filter((c) => c.work_order_id === id)
            .map((c) => (
              <div className="ops-history" key={c.id}>
                <p>
                  {opsLabel(c.kind)} · {cents(c.amount_cents)} · {c.description} · {c.reference}
                </p>
                {ui.active &&
                  c.kind === 'expense' &&
                  !['closed', 'cancelled'].includes(w.status) &&
                  !data.costs.some((r) => r.reverses_id === c.id) && (
                    <Action click={() => open('reverse_cost', c.id, id)}>Reverse expense</Action>
                  )}
              </div>
            ))}
        </>
      )}
      <h3>Materials used & returned</h3>
      {!materials.length ? (
        <p>No material usage recorded.</p>
      ) : (
        materials.map((m) => {
          const returned = materials
              .filter((r) => r.returns_id === m.id)
              .reduce((sum, r) => sum - BigInt(r.quantity_milli), 0n),
            remaining = BigInt(m.quantity_milli) - returned;
          return (
            <div className="ops-history" key={m.id}>
              <p>
                {m.item_snapshot.name} · {quantity(m.quantity_milli)} {m.item_snapshot.unit} · {m.reason}
              </p>
              {writable && !m.returns_id && remaining > 0n && (
                <Action click={() => open('return_material', m.id, id)}>Return unused materials</Action>
              )}
            </div>
          );
        })
      )}
      <h3>Equipment for this work</h3>
      {data.loans
        .filter((l) => l.work_order_id === id)
        .map((l) => (
          <div className="ops-history" key={l.id}>
            <p>
              {data.equipment.find((e) => e.id === l.equipment_id)?.name ?? 'Equipment'} · Out{' '}
              {l.checked_out_on} · Due {l.due_on} ·{' '}
              {l.returned_on ? `Returned ${l.returned_on}` : 'Checked out'}
            </p>
            {ui.active && !l.returned_on && (ui.office || l.employee_id === ui.snapshot.userId) && (
              <Action click={() => open('return_equipment', l.id)}>Return equipment</Action>
            )}
          </div>
        ))}
      {writable &&
        data.context.equipment
          .filter(
            (e) => e.property_id === ui.propertyId && e.available && ['good', 'fair'].includes(e.condition)
          )
          .map((e) => (
            <Action key={e.id} click={() => open('checkout_equipment', e.id, id)}>
              Check out {e.name}
            </Action>
          ))}
      <h3>Work photographs &amp; evidence review</h3>
      <p>Saved before-and-after or progress photographs are linked to this work order. Open a saved image to inspect it; review pending uploads separately before closing work.</p>
      <div className="stat-grid" aria-label="Work photograph review counts">
        <div className="stat-card"><span>Total photographs</span><strong>{workPhotos.length}</strong></div>
        <div className="stat-card"><span>Available images</span><strong>{workPhotos.filter(p => p.status === 'uploaded').length}</strong></div>
        <div className="stat-card"><span>Pending uploads</span><strong>{workPhotos.filter(p => p.status === 'pending').length}</strong></div>
        <div className="stat-card"><span>Voided images</span><strong>{workPhotos.filter(p => p.status === 'voided').length}</strong></div>
      </div>
      <label>Review photographs
        <select value={photoFilter} onChange={e => setPhotoFilter(e.target.value as typeof photoFilter)}>
          <option value="all">All photo records</option>
          <option value="uploaded">Available images</option>
          <option value="pending">Pending uploads</option>
          <option value="voided">Voided records</option>
        </select>
      </label>
      {!visiblePhotos.length && <p>No photographs match this filter.</p>}
      {visiblePhotos.map((p) => (
          <div className="ops-history" key={p.id}>
            <p>
              {opsLabel(p.kind)} · {p.caption || 'No caption'} · {opsLabel(p.status)}
            </p>
            {p.status === 'uploaded' && (
              <Action click={() => showPhoto(p.id, p.caption || `${p.kind} work photograph`)}>
                View photograph
              </Action>
            )}
            {writable && p.status === 'pending' && p.created_by === ui.snapshot.userId && (
              <Action click={() => open('photo', id, p.id)}>Retry pending photograph</Action>
            )}
            {ui.manage && ui.active && p.status !== 'voided' && (
              <Action click={() => open('void_work_photo', p.id)}>Void photograph</Action>
            )}
            {p.void_reason && <p>{p.void_reason}</p>}
          </div>
        ))}
      {photoError && (
        <p className="alert error" role="alert">
          {photoError}
        </p>
      )}
      {view && (
        <div className="ops-photo-view">
          <p>Private image access expires after 60 seconds.</p>
          {/* Private evidence bypasses optimization and caching. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="meter-evidence" src={view.url} alt={view.caption} referrerPolicy="no-referrer" />
          <button className="button secondary" onClick={() => setView(null)}>
            Hide photograph
          </button>
        </div>
      )}
      <h3>Requested parts and purchasing status</h3>
      <p className="muted small">
        These are structured supply requests linked to this exact repair. On-hand figures are recorded inventory,
        not reserved for this repair; on-order quantities are only outstanding placed-order lines explicitly linked to the request.
        Check physical stock and confirm delivery before resuming work.
      </p>
      {requestedParts.length===0 ? <p>No structured parts request has been recorded for this repair.
        {w.status==='waiting_parts'?' The job is marked waiting for parts; review its free-text requirements and request needed supplies.':''}
      </p> : (
        <div className="table-wrap" role="region" aria-label="Parts requests linked to this repair" tabIndex={0}>
          <table>
            <thead><tr><th>Part / request</th><th>Requested</th><th>Recorded on hand</th>
              <th>Placed-order deliveries outstanding</th><th>Next step</th></tr></thead>
            <tbody>{requestedParts.map(({request,item,onHandMilli,incomingMilli,placedOrderIds,overdueOrderCount,missingEtaOrderCount})=>(
              <tr key={request.id}>
                <th scope="row">{item?.name??'Unavailable inventory item'}
                  <small>{item?.sku??'Stock item reference unavailable'} · {opsLabel(request.status)}</small>
                  <small>Needed {request.needed_on}</small>
                  {['open','approved','ordered'].includes(request.status)&&
                    /^\d{4}-\d{2}-\d{2}$/.test(request.needed_on)&&
                    request.needed_on<ui.today&&
                    <small className="ops-overdue">Parts request needed date passed</small>}
                  {['open','approved','ordered'].includes(request.status)&&request.needed_on===ui.today&&
                    <small>Parts needed today</small>}
                </th>
                <td>{quantity(request.quantity_milli)} {item?.unit??'units'}</td>
                <td>{onHandMilli===null?'Unavailable':`${quantity(onHandMilli)} ${item?.unit??'units'}`}
                  <small>Not reserved</small>
                </td>
                <td>{quantity(incomingMilli)} {item?.unit??'units'} unreceived
                  <small>{placedOrderIds.length ? `${placedOrderIds.length} placed order(s)`:'No placed order linked to this request'}
                    {overdueOrderCount ? ` · ${overdueOrderCount} past expected date`:''}
                    {missingEtaOrderCount ? ` · ${missingEtaOrderCount} with no ETA`:''}</small>
                </td>
                <td>{placedOrderIds.length>0?(
                  <div className="action-group">
                    {placedOrderIds.map(orderId=><Action key={orderId} click={()=>open('purchase_detail',orderId)}>
                      Review placed order
                    </Action>)}
                  </div>
                ) : <span className="muted small">Review request status in Purchasing</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h3>Work and time history</h3>
      <p>Total recorded time {events.reduce((sum, e) => sum + e.minutes, 0)} minutes</p>
      {events.map((e) => (
        <div className="ops-history" key={e.id}>
          <p>
            {e.performed_on} · {opsLabel(e.kind)}
            {e.minutes ? ` · ${e.minutes} minutes` : ''}
            {e.to_status ? ` · ${opsLabel(e.to_status)}` : ''}
          </p>
          <p className="preserve-lines">{e.body}</p>
          <small>
            {e.created_by} · {e.created_at}
          </small>
        </div>
      ))}
    </>
  );
}
export function StockPanel({ ui, search, lowStockOnly = false, onLowStockChange, onReviewPurchasing }: {
  ui: OpsUI; search: string; lowStockOnly?: boolean;
  onLowStockChange?: (active: boolean) => void;
  onReviewPurchasing?: () => void;
}) {
  const ownItems=scoped(ui,ui.data.items);
  const reorder=lowStockInventory(ownItems,ui.data.summary.stock,[ui.propertyId]);
  const propertyTimezone=ui.snapshot.properties.find(p=>p.id===ui.propertyId)?.timezone??'America/Los_Angeles';
  const incoming=incomingDeliveryLines(
    ui.data.orders,ui.data.lines,ui.data.summary.purchase_lines,
    [{id:ui.propertyId,timezone:propertyTimezone}],
  );
  const coverage=incomingStockCoverage(reorder,incoming);
  const lowIds=new Set(reorder.map(row=>row.item.id));
  const rows=ownItems.filter(item=>
    (!lowStockOnly||lowIds.has(item.id)) &&
    `${item.sku} ${item.name} ${item.category} ${item.location}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Stock & supplies</h2>
          <p>
            Quantities come from retained movement history. New issues use the recorded standard unit cost.
          </p>
        </div>
        <div className="action-group">
          {onLowStockChange && <button type="button"
            className={`button ${lowStockOnly?'primary':'secondary'}`}
            aria-pressed={lowStockOnly}
            onClick={()=>onLowStockChange(!lowStockOnly)}>
            {lowStockOnly?'Show all stock':'Show low stock only'} ({reorder.length})
          </button>}
          {ui.manage && ui.active && <Action click={() => ui.open('save_item')}>Add stock item</Action>}
        </div>
      </div>
      {lowStockOnly && <p className="muted small" role="status">
        Showing {rows.length} low-stock items matching your search. Archived items are excluded.
        Quantities use saved stock movements; review before ordering.
      </p>}
      <details className="ops-record" open={lowStockOnly ? true : undefined}>
        <summary>Reorder shopping list — {reorder.length} low-stock items</summary>
        <p>Balances use recorded stock movements. Placed orders do not count as received stock; projected remaining needs depend on every outstanding order arriving.</p>
        {reorder.length === 0 ? <p>No active items are at or below their reorder thresholds.</p> : (
          <div className="table-wrap" role="region" aria-label="Supplies shopping list" tabIndex={0}>
            <table>
              <thead><tr><th>Supply / SKU</th><th>Storage location</th><th>In stock</th><th>Suggested refill</th><th>Existing requests</th><th>Placed orders / projected gap</th><th>Standard unit cost</th><th>Next step</th></tr></thead>
              <tbody>{coverage.map(({item,availableMilli,suggestedMilli,outstandingOnOrderMilli,gapIfReceivedMilli,placedOrderIds,overdueOrderCount,missingEtaOrderCount}) => {
                const existing=existingRestockRequests(ui.data.requests,ui.propertyId,item.id);
                return <tr key={item.id}>
                  <th scope="row">{item.name}<small>{item.sku}</small></th>
                  <td>{item.location || 'Not specified'}</td>
                  <td>{quantity(availableMilli)} {item.unit}</td>
                  <td>{quantity(suggestedMilli)} {item.unit}</td>
                  <td>{existing.count ? <>
                    <strong>{existing.count} active request(s)</strong>
                    <small>{existingRestockStatusText(existing)}</small>
                    <small>{quantity(existing.requestedMilli)} {item.unit} requested in records</small>
                    {onReviewPurchasing && <button className="text-button" type="button"
                      onClick={onReviewPurchasing}>Review purchasing</button>}
                  </> : 'None recorded'}</td>
                  <td>{placedOrderIds.length ? <>
                    <strong>{quantity(outstandingOnOrderMilli)} {item.unit} still on order</strong>
                    <small>{placedOrderIds.length} placed order(s){overdueOrderCount? ` · ${overdueOrderCount} late`:''}{missingEtaOrderCount? ` · ${missingEtaOrderCount} no ETA`:''}</small>
                    {placedOrderIds.length===1?
                      <button className="text-button" type="button"
                        onClick={()=>ui.open('purchase_detail',placedOrderIds[0])}>Review placed order</button>:
                      onReviewPurchasing&&<button className="text-button" type="button" onClick={onReviewPurchasing}>Review orders</button>}
                  </> : 'No placed order recorded'}
                    <small>{quantity(gapIfReceivedMilli)} {item.unit} target gap if delivered</small>
                  </td>
                  <td>{cents(item.unit_cost_cents)} / {item.unit}</td>
                  <td>{ui.active && BigInt(suggestedMilli)>0n
                    ?<Action click={() => ui.open('purchase_request',undefined,item.id)}>Request suggested refill</Action>
                    :<span className="muted small">Review restock target</span>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <p>Check existing requests and recorded placed orders before requesting another refill. Only manually recorded supplier orders with unreceived quantities appear on order, and they never increase physical stock. Projected gaps assume all those units arrive; they are not guaranteed deliveries. Managers still approve purchasing.</p>
      </details>
      {!rows.length ? (
        <Empty title="No matching stock items">
          Add a stock item, then record a delivery or receive an approved purchase.
        </Empty>
      ) : (
        <div className="table-wrap" role="region" aria-label="Inventory stock" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Item / location</th>
                <th>Available</th>
                <th>Reorder / restock</th>
                <th>Standard cost</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const stock = ui.data.summary.stock.find((s) => s.id === i.id);
                const existing = existingRestockRequests(ui.data.requests,ui.propertyId,i.id);
                return (
                  <tr key={i.id}>
                    <th scope="row">
                      <button className="text-button" onClick={() => ui.open('stock_detail', i.id)}>
                        {i.sku}
                      </button>
                      <small>
                        {i.name} {i.archived ? '· Archived' : ''}
                      </small>
                      <small>{i.location}</small>
                    </th>
                    <td>
                      {quantity(stock?.quantity_milli ?? '0')} {i.unit}
                      {!i.archived && BigInt(stock?.quantity_milli ?? '0') <= BigInt(i.reorder_milli) && (
                        <small className="ops-overdue">Low stock</small>
                      )}
                    </td>
                    <td>
                      {quantity(i.reorder_milli)} / {quantity(i.restock_milli)}
                    </td>
                    <td>
                      {cents(i.unit_cost_cents)} / {i.unit}
                      <small>Last purchase {stock?.last_purchase_on ?? 'None'}</small>
                      {existing.count>0 && <>
                        <small className="ops-overdue">{existing.count} existing request(s)</small>
                        <small>{existingRestockStatusText(existing)}</small>
                        {onReviewPurchasing && <button type="button" className="text-button"
                          onClick={onReviewPurchasing}>Review purchasing</button>}
                      </>}
                    </td>
                    <td>
                      <div className="action-group">
                        {ui.manage && ui.active && (
                          <Action click={() => ui.open('save_item', i.id)}>Edit item</Action>
                        )}
                        {ui.active && !i.archived && (
                          <>
                            <Action click={() => ui.open('receive_stock', i.id)}>Receive stock</Action>
                            <Action click={() => ui.open('purchase_request', undefined, i.id)}>
                              Request restock{lowIds.has(i.id) ? ' (suggested quantity)' : ''}
                            </Action>
                            {ui.manage && (
                              <>
                                <Action click={() => ui.open('adjust_stock', i.id)}>Adjust stock</Action>
                                <Action click={() => ui.open('transfer_stock', i.id)}>Transfer stock</Action>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function StockDetail({ ui, id }: { ui: OpsUI; id: string }) {
  const item = ui.data.items.find((i) => i.id === id);
  if (!item) return <p>Item unavailable.</p>;
  return (
    <>
      <h3>
        {item.sku} · {item.name}
      </h3>
      <p>
        {item.location} · {item.category} · {item.unit}
      </p>
      <p>{item.notes}</p>
      <HistoryTable
        label="Stock movement history"
        headers={['Date / movement', 'Quantity', 'Recorded cost', 'Reference / reason']}
        rows={ui.data.movements
          .filter((m) => m.item_id === id)
          .sort(
            (a, b) => a.effective_on.localeCompare(b.effective_on) || a.created_at.localeCompare(b.created_at)
          )
          .map((m) => ({
            id: m.id,
            cells: [
              <>
                {m.effective_on}
                <small>{opsLabel(m.kind)}</small>
              </>,
              `${quantity(m.delta_milli)} ${item.unit}`,
              cents(m.total_cost_cents),
              <>
                {m.reference}
                <small>{m.reason}</small>
                {m.transfer_id && <small>Transfer {m.transfer_id}</small>}
              </>,
            ],
          }))}
      />
    </>
  );
}
export function PurchasingPanel({ ui }: { ui: OpsUI }) {
  const { data, open } = ui;
  const [deliveryFilter,setDeliveryFilter]=useState<IncomingDeliveryFilter>('all');
  const [deliverySearch,setDeliverySearch]=useState('');
  const [requestFilter,setRequestFilter]=useState<PurchaseRequestAttentionFilter>('all');
  const [requestSearch,setRequestSearch]=useState('');
  const propertyTimezone=ui.snapshot.properties.find(p=>p.id===ui.propertyId)?.timezone??'America/Los_Angeles';
  const incoming=incomingDeliveryLines(
    data.orders,data.lines,data.summary.purchase_lines,
    [{id:ui.propertyId,timezone:propertyTimezone}],
  );
  const visibleIncoming=filterIncomingDeliveries(incoming,deliveryFilter,deliverySearch);
  const purchaseRequests=purchaseRequestAttention(
    data.requests,data.items,data.work,ui.propertyId,ui.today,
  );
  const visibleRequests=filterPurchaseRequestAttention(purchaseRequests,requestFilter,requestSearch);
  const requestOverdue=purchaseRequests.filter(row=>row.deadline==='overdue').length;
  const requestDueToday=purchaseRequests.filter(row=>row.deadline==='due_today').length;
  const requestOpen=purchaseRequests.filter(row=>row.request.status==='open').length;
  const approvedUnlinked=approvedRequestsWithoutLinkedOrders(
    purchaseRequests,data.orders,data.lines,data.summary.purchase_lines,ui.propertyId,
  );
  const approvedWithOrder=purchaseRequests.filter(row=>row.request.status==='approved'&&
    linkedPurchaseReview(row.request,data.orders,data.lines,data.summary.purchase_lines,ui.propertyId)
      .activeOrders.length>0).length;
  const exportRequests=()=>{
    if(!visibleRequests.length)return;
    const payload=csv(purchaseRequestAttentionCsvRows(visibleRequests));
    const url=URL.createObjectURL(new Blob([payload],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='forgeos-visible-parts-requests.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const attentionChoices:[IncomingDeliveryFilter,string][]=[
    ['all','All outstanding'],['overdue','Past expected date'],
    ['due_today','Expected today'],['upcoming','Upcoming'],
    ['not_scheduled','No ETA'],['part_received','Part received'],
  ];
  const exportIncoming=()=>{
    if(!visibleIncoming.length)return;
    const payload=csv(incomingDeliveriesCsvRows(visibleIncoming));
    const url=URL.createObjectURL(new Blob([payload],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='forgeos-visible-incoming-supplies.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return (
    <>
      <section className="panel" aria-label="Incoming supplies awaiting receipt">
        <div className="panel-heading">
          <div>
            <h2>Incoming supply deliveries</h2>
            <p>Recorded orders placed with quantities not yet received. Expected dates are estimates, not proof of shipment.</p>
          </div>
          <strong>{incoming.length} outstanding order line(s)</strong>
        </div>
        {incoming.length>0 && <>
          <div className="action-group" role="group" aria-label="Incoming delivery attention filters">
            {attentionChoices.map(([key,label])=>(
              <button key={key} type="button"
                className={`button ${deliveryFilter===key?'primary':'secondary'}`}
                aria-pressed={deliveryFilter===key}
                onClick={()=>setDeliveryFilter(key)}>
                {label} ({filterIncomingDeliveries(incoming,key,'').length})
              </button>
            ))}
          </div>
          <div className="action-group">
            <label>Search incoming supplies
              <input type="search" value={deliverySearch}
                placeholder="Order number, supplier, item or SKU"
                onChange={event=>setDeliverySearch(event.target.value)}/>
            </label>
            <button type="button" className="button secondary" onClick={exportIncoming}
              disabled={!visibleIncoming.length}>Export visible deliveries CSV ({visibleIncoming.length})</button>
          </div>
          <p className="muted small" role="status">Showing {visibleIncoming.length} of {incoming.length} recorded outstanding order lines.
            Filter counts cover the whole current property before search. Export contains exactly the currently visible rows and their saved receipt balances.</p>
        </>}
        {!incoming.length?<p>No placed order lines are awaiting receipt in this property&apos;s records.</p>:
         !visibleIncoming.length?<p role="status">No incoming order lines match this filter or search. Choose All outstanding or clear the search to see more.</p>:(
          <div className="table-wrap" role="region" aria-label="Outstanding supply deliveries" tabIndex={0}>
            <table>
              <thead><tr><th>Order / supply</th><th>Expected</th><th>Ordered</th><th>Net received</th><th>Still outstanding</th><th>Action</th></tr></thead>
              <tbody>{visibleIncoming.map(row=>(
                <tr key={row.line.id}>
                  <th scope="row">
                    {row.order.number}
                    <small>{row.line.item_snapshot.name} · {row.line.item_snapshot.sku}</small>
                    <small>{row.order.supplier_snapshot.name}</small>
                  </th>
                  <td>{row.order.expected_on??'No delivery date recorded'}
                    <small>{row.eta==='overdue'?'Past expected date':row.eta==='due_today'?'Expected today':row.eta==='upcoming'?'Upcoming':'ETA needed'}</small>
                  </td>
                  <td>{quantity(row.line.quantity_milli)} {row.line.item_snapshot.unit}</td>
                  <td>{quantity(row.netReceivedMilli)} {row.line.item_snapshot.unit}</td>
                  <td><strong>{quantity(row.outstandingMilli)} {row.line.item_snapshot.unit}</strong></td>
                  <td><div className="action-group">
                    <Action click={()=>open('purchase_detail',row.order.id)}>Review order</Action>
                    {ui.active && <Action click={()=>open('receive_purchase',row.line.id)}>Record delivery</Action>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="muted small">Only orders marked placed are included. Drafts, approvals and cancelled orders are excluded. Partial receipts reduce the outstanding recorded quantity, not the reorder threshold. CSV contains recorded milliunits (1000 = 1 unit). Recording delivery requires an explicit action; this page does not adjust stock on its own.</p>
      </section>
      <PurchasingExpenseSnapshot data={data} propertyId={ui.propertyId} organizationId={ui.snapshot.organizationId} />
      <section className="panel" aria-label="Approved supply requests without linked purchase orders">
        <div className="panel-heading">
          <div>
            <h2>Approved requests awaiting a linked order</h2>
            <p>These requests have no active purchase-order line explicitly linked in this
              property&apos;s records. Check existing supplier orders before buying.</p>
          </div>
          <strong>{approvedUnlinked.length} to review</strong>
        </div>
        <p>{approvedWithOrder} approved request(s) already linked to an active recorded order.</p>
        {approvedUnlinked.length===0?<p>No approved requests are missing an active linked order.</p>:(
          <div className="table-wrap" role="region" aria-label="Approved requests needing order review" tabIndex={0}>
            <table>
              <thead><tr><th>Supply / repair</th><th>Quantity</th><th>Needed by</th><th>Next step</th></tr></thead>
              <tbody>{approvedUnlinked.map(({request,item,work,deadline})=>(
                <tr key={request.id}>
                  <th scope="row">{item?.name??'Inventory item unavailable'}
                    <small>{item?.sku??'SKU unavailable'}</small>
                    {work&&<small>{work.number} · linked repair</small>}
                  </th>
                  <td>{quantity(request.quantity_milli)} {item?.unit??'units'}</td>
                  <td>{request.needed_on||'Unavailable'}
                    {deadline==='overdue'&&<small className="ops-overdue">Past needed date</small>}
                    {deadline==='due_today'&&<small>Needed today</small>}
                  </td>
                  <td>
                    {ui.manage&&ui.active?
                      <Action click={()=>open('new_purchase')}>Prepare order manually</Action>:
                      <span className="muted small">Manager follow-up required</span>}
                    {work&&<button type="button" className="text-button"
                      onClick={()=>open('work_detail',work.id)}>Review repair</button>}
                    {linkedPurchaseReview(request,data.orders,data.lines,data.summary.purchase_lines,ui.propertyId)
                      .cancelledLinkedOrders>0&&<small>Cancelled linked orders: {linkedPurchaseReview(request,data.orders,data.lines,data.summary.purchase_lines,ui.propertyId).cancelledLinkedOrders}. Review order history before purchasing again.</small>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="muted small">Prepare order opens the existing manual purchase-order form,
          not a prelinked or submitted order. Select the correct approved request, item,
          quantity and supplier in that form. A missing record link does not prove that
          nothing was purchased outside ForgeOS.</p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Purchase requests</h2>
            <p>Review the needed-by date for each active supply request before approving or preparing an order.
              An order being placed does not prove the supplies were received.</p>
          </div>
          {ui.active && <Action click={() => open('purchase_request')}>Request supplies</Action>}
        </div>
        <div className="stat-grid" aria-label="Supply request deadline summary">
          <div className="stat-card"><span>Requests past needed date</span><strong>{requestOverdue}</strong></div>
          <div className="stat-card"><span>Requests needed today</span><strong>{requestDueToday}</strong></div>
          <div className="stat-card"><span>Awaiting decision</span><strong>{requestOpen}</strong></div>
        </div>
        {purchaseRequests.length>0&&<>
          <div className="quick-actions" role="group" aria-label="Supply request attention filters">
            {purchaseRequestAttentionChoices.map(choice=>(
              <button type="button" key={choice.value}
                className={`button ${requestFilter===choice.value?'primary':'secondary'}`}
                aria-pressed={requestFilter===choice.value}
                onClick={()=>setRequestFilter(choice.value)}>
                {choice.label} ({filterPurchaseRequestAttention(purchaseRequests,choice.value,'').length})
              </button>
            ))}
          </div>
          <div className="action-group">
            <label>Search parts requests
              <input type="search" value={requestSearch}
                placeholder="Item, SKU, repair number or request ID"
                onChange={event=>setRequestSearch(event.target.value)}/>
            </label>
            <button type="button" className="button secondary"
              onClick={exportRequests} disabled={!visibleRequests.length}>
              Export visible requests CSV ({visibleRequests.length})
            </button>
          </div>
          <p className="muted small" role="status">
            Showing {visibleRequests.length} of {purchaseRequests.length} property requests,
            prioritized by active needed-by dates. Filter counts are before search.
            Export includes exactly the displayed rows; milliunits are labeled (1000 = 1 unit).
          </p>
        </>}
        {!purchaseRequests.length ? (
          <p>No purchase requests for this property.</p>
        ) : !visibleRequests.length ? (
          <p role="status">No requests match these filters. Choose All requests or clear the search to review more.</p>
        ) : (
          visibleRequests.map(({request:r,item,work,deadline}) => {
            const linked=linkedPurchaseReview(r,data.orders,data.lines,data.summary.purchase_lines,ui.propertyId);
            return <article className="ops-record" key={r.id}>
              <h3>{item?.name ?? 'Unavailable stock item'} · {quantity(r.quantity_milli)} {item?.unit??'units'}</h3>
              <p>Needed {r.needed_on||'Date unavailable'} · {opsLabel(r.status)}</p>
              <p className="muted small">
                {linkedPurchaseStageLabels[linked.stage]}
                {linked.activeOrders.length>0&&` · ${linked.activeOrders.length} active linked order(s)`}
                {linked.cancelledLinkedOrders>0&&` · ${linked.cancelledLinkedOrders} cancelled linked order(s)`}
              </p>
              {r.status==='approved'&&hasInvalidRequestedQuantity(r.quantity_milli)&&<p className="ops-overdue" role="status">
                <strong>Review approved request quantity:</strong> The requested quantity is missing, zero, or invalid. Verify and correct the source request through authorized controls before preparing a purchase order.
              </p>}
              {linked.activeOrders.length>0&&<p className="muted small">
                Linked purchase lines: {quantity(linked.orderedMilli)} {item?.unit??'units'} total;
                {' '}{quantity(linked.placedReceiptMilli)} recorded received on placed orders;
                {' '}{quantity(linked.unplacedReceiptMilli)} recorded on draft/approved orders (review status);
                {' '}{quantity(linked.placedUnreceivedMilli)} outstanding on placed orders;
                {' '}{quantity(linked.preparingMilli)} remaining on draft/approved orders.
                {' '}Placed does not prove shipment; recorded receipts do not confirm repair completion.
              </p>}
              {r.status==='approved'&&linked.activeOrders.length>0&&linkedOrderQuantityGap(r.quantity_milli,linked.orderedMilli)!=='0'&&<p className="ops-overdue">
                <strong>Review quantity coverage:</strong> {quantity(linkedOrderQuantityGap(r.quantity_milli,linked.orderedMilli))} {item?.unit??'units'} requested beyond recorded active linked order lines. Verify existing stock and purchasing records before ordering more.
              </p>}
              {r.status==='approved'&&linked.activeOrders.length>0&&linkedOrderQuantityExcess(r.quantity_milli,linked.orderedMilli)!=='0'&&<p className="ops-overdue">
                <strong>Review possible excess purchasing:</strong> {quantity(linkedOrderQuantityExcess(r.quantity_milli,linked.orderedMilli))} {item?.unit??'units'} more on active linked orders than the approved request quantity. Verify linked lines, existing stock and supplier records; this does not prove a duplicate order.
              </p>}
              {linked.unplacedReceiptMilli!=='0'&&<p className="ops-overdue">
                <strong>Review order status:</strong> {quantity(linked.unplacedReceiptMilli)} {item?.unit??'units'} recorded received against linked draft/approved orders. Verify order and receipt records; this warning does not change stock or order status.
              </p>}
              {(linked.invalidQuantityLines>0||linked.invalidReceiptLines>0)&&<p className="ops-overdue" role="status">
                <strong>Review purchasing data:</strong> {linked.invalidQuantityLines} linked line(s) have invalid or zero order quantities; {linked.invalidReceiptLines} linked line(s) have malformed receipt quantities. Verify the original records; this summary does not edit them.
              </p>}
              {linked.activeOrders.length>0&&<div className="action-group">
                {linked.activeOrders.map(order=><button type="button" className="text-button"
                  key={order.id} onClick={()=>open('purchase_detail',order.id)}>
                  Review {order.number} ({opsLabel(order.status)})
                </button>)}
              </div>}
              {r.status==='approved'&&!linked.activeOrders.length&&
                <p className="ops-overdue"><strong>Approved request has no active linked purchase order.</strong>
                  {linked.cancelledLinkedOrders>0&&<span> Prior linked purchase orders were cancelled. Review order history before preparing another order.</span>}
                  {ui.manage&&ui.active&&
                    <button type="button" className="text-button" onClick={()=>open('new_purchase')}>
                      Prepare order manually
                    </button>}
                </p>}
              {deadline==='overdue'&&<p className="ops-overdue"><strong>Past parts needed date — review request</strong></p>}
              {deadline==='due_today'&&<p><strong>Parts needed today — review request</strong></p>}
              {deadline==='no_valid_date'&&<p className="muted small">Needed date unavailable or invalid; verify the record.</p>}
              {work&&<p>
                Linked repair: <button className="text-button" type="button"
                  onClick={()=>open('work_detail',work.id)}>{work.number}</button>
              </p>}
              <p>{r.description}</p>
              {r.decision_reason && <p>Decision: {r.decision_reason}</p>}
              {ui.manage &&
                ui.active &&
                ['open', 'approved', 'declined'].includes(r.status) &&
                !data.lines.some(
                  (line) =>
                    line.request_id === r.id &&
                    data.orders.some(
                      (order) => order.id === line.purchase_order_id && order.status !== 'cancelled'
                    )
                ) && (
                  <div className="action-group">
                    {r.status !== 'approved' && (
                      <Action click={() => open('decide_purchase', r.id, undefined, 'approved')}>
                        Approve request
                      </Action>
                    )}
                    {r.status !== 'declined' && (
                      <Action click={() => open('decide_purchase', r.id, undefined, 'declined')}>
                        Decline request
                      </Action>
                    )}
                    <Action click={() => open('decide_purchase', r.id, undefined, 'cancelled')}>
                      Cancel request
                    </Action>
                  </div>
                )}
            </article>;
          })
        )}
        <p className="muted small">Needed-by alerts apply only to open, approved or marked-ordered requests.
          Resolved requests do not count as overdue, and recorded orders are not guaranteed deliveries.
          Dates and summaries are read-only; approving or cancelling requires the existing explicit action.
          Staff-entered item names can contain sensitive information—review CSV files before sharing.</p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Purchase orders</h2>
            <p>Internal approval and manual order tracking. No supplier message or payment is sent.</p>
          </div>
          {ui.active && <Action click={() => open('new_purchase')}>Prepare purchase order</Action>}
        </div>
        {!scoped(ui, data.orders).length ? (
          <Empty title="No purchase orders">
            Add a supplier and stock items, then prepare an order for manager review.
          </Empty>
        ) : (
          <HistoryTable
            label="Purchase orders"
            headers={['Order / supplier', 'Status', 'Expected / total', 'Actions']}
            rows={scoped(ui, data.orders).map((p) => ({
              id: p.id,
              cells: [
                <>
                  <button className="text-button" onClick={() => open('purchase_detail', p.id)}>
                    {p.number}
                  </button>
                  <small>{p.supplier_snapshot.name}</small>
                </>,
                opsLabel(purchaseState(p, data.lines, data.summary.purchase_lines)),
                <>
                  {p.expected_on ?? 'Not scheduled'}
                  <small>
                    {cents(
                      data.lines
                        .filter((l) => l.purchase_order_id === p.id)
                        .reduce((s, l) => s + BigInt(l.total_cost_cents), 0n)
                    )}
                  </small>
                </>,
                <div className="action-group" key="actions">
                  {ui.manage && ui.active && p.status === 'draft' && (
                    <Action click={() => open('purchase_status', p.id, undefined, 'approved')}>
                      Approve order
                    </Action>
                  )}
                  {ui.manage && ui.active && p.status === 'approved' && (
                    <Action click={() => open('purchase_status', p.id, undefined, 'ordered')}>
                      Record order placed
                    </Action>
                  )}
                  {ui.manage && ui.active && p.status !== 'cancelled' && (
                    <Action click={() => open('purchase_status', p.id, undefined, 'cancelled')}>
                      Cancel order
                    </Action>
                  )}
                </div>,
              ],
            }))}
          />
        )}
      </section>
    </>
  );
}
export function PurchaseDetail({ ui, id }: { ui: OpsUI; id: string }) {
  const p = ui.data.orders.find((p) => p.id === id);
  if (!p) return <p>Purchase unavailable.</p>;
  return (
    <>
      <h3>
        {p.number} · {p.supplier_snapshot.name}
      </h3>
      <p>
        {opsLabel(purchaseState(p, ui.data.lines, ui.data.summary.purchase_lines))} · Expected{' '}
        {p.expected_on ?? 'Not scheduled'}
      </p>
      <p>
        {p.reference} · {p.reason}
      </p>
      <p>
        Approval: {p.approval_reason || 'Not approved'} · {p.approved_by}
      </p>
      <p>
        {p.supplier_snapshot.contact} · {p.supplier_snapshot.phone} · {p.supplier_snapshot.email}
      </p>
      {ui.data.lines
        .filter((l) => l.purchase_order_id === id)
        .map((l) => {
          const net = ui.data.summary.purchase_lines.find((s) => s.id === l.id)?.received_milli ?? '0';
          return (
            <article className="ops-record" key={l.id}>
              <h3>
                {l.item_snapshot.sku} · {l.item_snapshot.name}
              </h3>
              <p>
                Ordered {quantity(l.quantity_milli)} {l.item_snapshot.unit} · Net received {quantity(net)} ·
                Cost {cents(l.total_cost_cents)}
              </p>
              {ui.active && p.status === 'ordered' && BigInt(net) < BigInt(l.quantity_milli) && (
                <Action click={() => ui.open('receive_purchase', l.id)}>Receive delivery</Action>
              )}
              {ui.data.receipts
                .filter((r) => r.line_id === l.id)
                .map((r) => {
                  const returned = ui.data.receipts
                    .filter((x) => x.returns_id === r.id)
                    .reduce((s, x) => s - BigInt(x.quantity_milli), 0n);
                  return (
                    <div className="ops-history" key={r.id}>
                      <p>
                        {r.effective_on} · {quantity(r.quantity_milli)} {l.item_snapshot.unit} · {r.reference}
                      </p>
                      <p>{r.reason}</p>
                      {ui.manage &&
                        ui.active &&
                        p.status === 'ordered' &&
                        !r.returns_id &&
                        BigInt(r.quantity_milli) > returned && (
                          <Action click={() => ui.open('return_purchase', r.id)}>
                            Return received stock
                          </Action>
                        )}
                    </div>
                  );
                })}
            </article>
          );
        })}
    </>
  );
}
export function SuppliersPanel({ ui }: { ui: OpsUI }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Supplier directory</h2>
          <p>Saved order snapshots retain earlier contact details.</p>
        </div>
        {ui.manage && ui.active && <Action click={() => ui.open('save_supplier')}>Add supplier</Action>}
      </div>
      {scoped(ui, ui.data.suppliers).map((s) => (
        <article className="ops-record" key={s.id}>
          <h3>
            {s.name}
            {s.archived ? ' · Archived' : ''}
          </h3>
          <p>
            {s.contact} · {s.email} · {s.phone}
          </p>
          <p className="preserve-lines">{s.address}</p>
          <p>{s.notes}</p>
          {ui.manage && ui.active && (
            <Action click={() => ui.open('save_supplier', s.id)}>Edit supplier</Action>
          )}
        </article>
      ))}
    </section>
  );
}
export function EquipmentPanel({ ui, search }: { ui: OpsUI; search: string }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Equipment & checkout</h2>
          <p>One active loan per asset. Repair and overdue service block new checkouts.</p>
        </div>
        {ui.manage && ui.active && <Action click={() => ui.open('save_equipment')}>Add equipment</Action>}
      </div>
      {!scoped(ui, ui.data.equipment).length ? (
        <Empty title="No equipment in this view">
          Managers maintain the equipment directory. Assigned staff see equipment linked to their authorized
          work and loans.
        </Empty>
      ) : (
        <HistoryTable
          label="Property equipment"
          headers={['Asset', 'Condition / service', 'Current checkout', 'Actions']}
          rows={scoped(ui, ui.data.equipment)
            .filter((e) =>
              `${e.code} ${e.name} ${e.serial_number}`.toLowerCase().includes(search.toLowerCase())
            )
            .map((e) => {
              const loan = ui.data.loans.find((l) => l.equipment_id === e.id && !l.returned_on);
              return {
                id: e.id,
                cells: [
                  <>
                    <button className="text-button" onClick={() => ui.open('equipment_detail', e.id)}>
                      {e.code}
                    </button>
                    <small>
                      {e.name}
                      {e.archived ? ' · Archived' : ''}
                    </small>
                  </>,
                  <>
                    {opsLabel(e.condition)}
                    <small>Service {e.next_service_on ?? 'Not scheduled'}</small>
                  </>,
                  loan ? (
                    <>
                      {staffName(ui, loan.employee_id)}
                      <small>Due {loan.due_on}</small>
                    </>
                  ) : (
                    'Available'
                  ),
                  <div className="action-group" key="actions">
                    {ui.manage && ui.active && (
                      <Action click={() => ui.open('save_equipment', e.id)}>Edit asset</Action>
                    )}
                    {ui.office && ui.active && !loan && !e.archived && (
                      <Action click={() => ui.open('checkout_equipment', e.id)}>Check out</Action>
                    )}
                    {ui.active && loan && (ui.office || loan.employee_id === ui.snapshot.userId) && (
                      <Action click={() => ui.open('return_equipment', loan.id)}>Return equipment</Action>
                    )}
                    {ui.manage && ui.active && !loan && (
                      <Action click={() => ui.open('service_equipment', e.id)}>Record service</Action>
                    )}
                  </div>,
                ],
              };
            })}
        />
      )}
    </section>
  );
}
export function EquipmentDetail({ ui, id }: { ui: OpsUI; id: string }) {
  const e = ui.data.equipment.find((e) => e.id === id);
  if (!e) return <p>Equipment history unavailable.</p>;
  return (
    <>
      <h3>
        {e.name} · {e.code}
      </h3>
      <p>
        Serial {e.serial_number || 'Not recorded'} · {opsLabel(e.condition)} · Next service{' '}
        {e.next_service_on ?? 'Not scheduled'}
      </p>
      <p>{e.notes}</p>
      <h3>Checkout history</h3>
      {ui.data.loans
        .filter((l) => l.equipment_id === id)
        .map((l) => (
          <div className="ops-history" key={l.id}>
            <p>
              {staffName(ui, l.employee_id)} · Out {l.checked_out_on} · Due {l.due_on} ·{' '}
              {l.returned_on ? `Returned ${l.returned_on}` : 'Checked out'}
            </p>
            <p>
              {l.reason} {l.return_reason}
            </p>
            {l.work_order_id && (
              <p>Work {ui.data.work.find((w) => w.id === l.work_order_id)?.number ?? 'Related work order'}</p>
            )}
            {ui.active && !l.returned_on && (ui.office || l.employee_id === ui.snapshot.userId) && (
              <Action click={() => ui.open('return_equipment', l.id)}>Return equipment</Action>
            )}
          </div>
        ))}
      <h3>Service & condition history</h3>
      {ui.data.equipmentEvents
        .filter((x) => x.equipment_id === id)
        .map((x) => (
          <div className="ops-history" key={x.id}>
            <p>
              {x.performed_on} · {opsLabel(x.kind)} · {opsLabel(x.condition)}
            </p>
            <p>{x.body}</p>
          </div>
        ))}
    </>
  );
}
export function DailyPanel({ ui }: { ui: OpsUI }) {
  const assignedToday = employeeTodayWork(scoped(ui,ui.data.work),ui.propertyId,ui.today,ui.snapshot.userId);
  const [safetyFilter, setSafetyFilter] = useState<'all' | 'failed' | 'attention' | 'skipped'>('all');
  const todaysRuns = scoped(ui, ui.data.runs).filter((run) => run.scheduled_for === ui.today);
  const openToday = todaysRuns.filter((run) => run.status === 'open');
  const employeeProgress = employeeChecklistProgress(todaysRuns,ui.data.entries,ui.today);
  const itemsToday = todaysRuns.reduce((total, run) => total + run.items.length, 0);
  const recordedToday = todaysRuns.reduce((total, run) => total + run.items.filter((item) =>
    ['done', 'skipped'].includes(checklistState(ui.data.entries, run.id, item.key)?.status ?? '')
  ).length, 0);
  const walkthroughRows = todaysRuns.map(run => {
    const recorded = run.items.filter(item => ['done', 'skipped'].includes(
      checklistState(ui.data.entries, run.id, item.key)?.status ?? ''
    )).length;
    return { run, recorded, remaining: run.items.length - recorded };
  }).sort((a, b) => b.remaining - a.remaining || a.run.label.localeCompare(b.run.label));
  const completedWalkthroughs = walkthroughRows.filter(row => row.remaining === 0 && row.run.items.length > 0).length;
  const inspectionFindings = scoped(ui, ui.data.runs).flatMap((run) =>
    run.items.flatMap((item) => {
      const entry = checklistState(ui.data.entries, run.id, item.key);
      if (!entry || entry.status !== 'skipped') return [];
      const severity = entry.notes.startsWith('[Inspection: Fail]') ? 'Failed inspection' :
        entry.notes.startsWith('[Inspection: Needs attention]') ? 'Needs attention' : 'Skipped — review';
      return [{ id: entry.id, run, item, entry, severity }];
    })
  ).sort((a, b) => b.entry.created_at.localeCompare(a.entry.created_at));
  const visibleFindings = inspectionFindings.filter((f) => safetyFilter === 'all' ||
    (safetyFilter === 'failed' && f.severity === 'Failed inspection') ||
    (safetyFilter === 'attention' && f.severity === 'Needs attention') ||
    (safetyFilter === 'skipped' && f.severity === 'Skipped — review'));
  const failedFindings = inspectionFindings.filter((f) => f.severity === 'Failed inspection');
  const needsAttention = inspectionFindings.filter((f) => f.severity === 'Needs attention');
  const priorityRepairs = scoped(ui, ui.data.work).filter((w) =>
    !['closed', 'cancelled'].includes(w.status) && ['urgent', 'high'].includes(w.priority)
  ).sort((a, b) => (a.priority === 'urgent' ? -1 : 1) - (b.priority === 'urgent' ? -1 : 1));
  const overdueInspections = scoped(ui, ui.data.runs).filter(run =>
    run.status === 'open' && run.scheduled_for < ui.today
  ).sort((a,b)=>a.scheduled_for.localeCompare(b.scheduled_for));
  const urgentRepairs = priorityRepairs.filter(work => work.priority === 'urgent');
  const overdueRepairs = scoped(ui, ui.data.work).filter(work =>
    !!work.due_on && work.due_on < ui.today && !['closed','completed','cancelled'].includes(work.status)
  ).sort((a,b)=>(a.due_on??'').localeCompare(b.due_on??''));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Daily checklists</h2>
          <p>Each run retains its item list, assignee, dated results and completion history.</p>
        </div>
        {ui.manage && ui.active && (
          <Action click={() => ui.open('save_plan', undefined, undefined, 'checklist')}>
            Add checklist plan
          </Action>
        )}
      </div>
      {ui.manage && ui.active && <section className="ops-record" aria-label="Cleaning checklist templates">
        <h3>Start from a cleaning or inspection template</h3>
        <p>Choose a template, then review its items, site, schedule and employee assignment before saving. Nothing is assigned automatically.</p>
        <div className="button-row">{propertyChecklistTemplates.map(template=><button className="button secondary" type="button" key={template.id} onClick={()=>ui.open('save_plan',undefined,undefined,'template:'+template.id)}>{template.label}</button>)}</div>
      </section>}
      <section className="ops-record" aria-label="My assigned work today">
        <h3>My assigned work today · {ui.today}</h3>
        <p>Open jobs assigned to your account, urgent and overdue first. Change job progress in Maintenance.</p>
        {!assignedToday.length ? <p>No active work orders assigned to you for today.</p> :
          <div className="table-wrap" role="region" aria-label="My daily assigned jobs" tabIndex={0}>
            <table><thead><tr><th>Priority</th><th>Job</th><th>Due</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>{assignedToday.map(work=><tr key={work.id}>
                <td>{opsLabel(work.priority)}</td>
                <td>{work.title}</td>
                <td>{work.due_on ?? 'Not set'}</td>
                <td>{opsLabel(work.status)}</td>
                <td><button type="button" className="button secondary" onClick={()=>ui.open('work_detail',work.id)}>View job</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
      <div className="ops-record" aria-label="Daily checklist progress">
        <h3>Today at a glance · {ui.today}</h3>
        <p>{todaysRuns.length} scheduled checklist runs · {openToday.length} open · {recordedToday}/{itemsToday} item results recorded</p>
        <p>Recorded includes completed and explicitly skipped items; a skipped item is not the same as completed work.</p>
      </div>
      {ui.manage && <section className="ops-record" aria-label="Employee checklist completion by assignee">
        <h3>Supervisor checklist progress by employee</h3>
        <p>Saved results for today. Skipped and reopened items are not counted as completed.</p>
        {!employeeProgress.length ? <p>No active checklist runs scheduled today.</p> :
        <div className="table-wrap" role="region" aria-label="Daily employee checklist progress" tabIndex={0}>
          <table><thead><tr><th>Employee</th><th>Runs</th><th>Completed</th><th>Skipped / review</th><th>Remaining</th></tr></thead>
          <tbody>{employeeProgress.map(row=><tr key={row.assigneeId}>
            <th scope="row">{ui.data.staff.find(staff=>staff.user_id===row.assigneeId && staff.property_id===ui.propertyId)?.name ?? (row.assigneeId==='unassigned'?'Unassigned':'Assigned employee')}</th>
            <td>{row.runs}</td><td>{row.done}</td><td>{row.skipped}</td><td><strong>{row.remaining}</strong></td>
          </tr>)}</tbody></table>
        </div>}
        <p>Open the walkthrough below to review who recorded each item and when; employee totals are for the selected property only.</p>
      </section>}
      <section className="ops-record" aria-label="Daily property walkthrough progress">
        <h3>Property walkthrough progress</h3>
        <p>Today&apos;s assigned checklist runs for RV sites, apartments and common areas. A skipped check is recorded but still needs review; these counts do not certify an inspection as passed.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Scheduled walkthroughs</span><strong>{walkthroughRows.length}</strong></div>
          <div className="stat-card"><span>All items recorded</span><strong>{completedWalkthroughs}</strong></div>
          <div className="stat-card"><span>Walkthroughs with items remaining</span><strong>{walkthroughRows.filter(row => row.remaining > 0).length}</strong></div>
        </div>
        {!walkthroughRows.length ? <p>No checklists scheduled for today. Create a checklist plan and generate a run from the recurring calendar.</p> :
          <div className="table-wrap" role="region" aria-label="Today's walkthroughs" tabIndex={0}>
            <table>
              <thead><tr><th>Inspection</th><th>Results recorded</th><th>Remaining</th><th>Open</th></tr></thead>
              <tbody>{walkthroughRows.map(({run,recorded,remaining}) => <tr key={run.id}>
                <th scope="row">{run.label}<small>{opsLabel(run.status)}</small></th>
                <td>{recorded} / {run.items.length}</td>
                <td><strong>{remaining}</strong></td>
                <td><button type="button" className="button secondary small"
                  onClick={() => ui.open('run_detail', run.id)}>Open walkthrough</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
        <p>Open a walkthrough to record item results, document location, and link repair work through the existing inspection controls.</p>
      </section>
      <details className="ops-record">
        <summary>Suggested manager checklist — morning, utilities, office and closing</summary>
        <p>Use these as a guide when creating a recurring checklist plan. These examples are not saved tasks until a manager creates a plan and schedules a run.</p>
        <ul>
          <li><strong>Morning property walk:</strong> bathrooms, laundry rooms, trash cans, roads, walkways and landscaping</li>
          <li><strong>Utility checks:</strong> look for water leaks, electrical hazards and gas concerns; review meter-reading exceptions with authorized staff</li>
          <li><strong>Maintenance:</strong> review new requests, assign technicians, confirm materials and review completed work</li>
          <li><strong>Office:</strong> check arrivals, planned departures, issued balances and resident follow-ups</li>
          <li><strong>End of day:</strong> verify checklist results, record unresolved work and plan tomorrow&apos;s priorities</li>
        </ul>
        <p>Use the Add checklist plan action above to set owners, real inspection items and a recurrence schedule. Use the recurring calendar to create saved runs.</p>
      </details>
      <SupervisorReviewDashboard ui={ui} />
      <section className="ops-record" aria-label="Manager safety alerts">
        <h3>Manager safety alerts</h3>
        <p>Live review queue based on saved inspection dates and maintenance priority. These are dashboard alerts only: no automatic texts, emails, or claims of safety certification.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Overdue inspections</span><strong>{overdueInspections.length}</strong></div>
          <div className="stat-card"><span>Urgent repair orders</span><strong>{urgentRepairs.length}</strong></div>
          <div className="stat-card"><span>Overdue repair orders</span><strong>{overdueRepairs.length}</strong></div>
          <div className="stat-card"><span>Failed checks to review</span><strong>{failedFindings.length}</strong></div>
        </div>
        {overdueInspections.length > 0 && <details>
          <summary>Overdue inspection alerts ({overdueInspections.length})</summary>
          {overdueInspections.slice(0, 20).map(run => <article className="ops-history" key={run.id}>
            <strong>Overdue since {run.scheduled_for}</strong> · {run.label}
            <button type="button" className="text-button" onClick={()=>ui.open('run_detail',run.id)}>Review inspection</button>
          </article>)}
        </details>}
        {urgentRepairs.length > 0 && <details>
          <summary>Urgent maintenance alerts ({urgentRepairs.length})</summary>
          {urgentRepairs.slice(0, 20).map(work => <article className="ops-history" key={work.id}>
            <strong>Urgent</strong> · {work.number} · {work.title}
            <p>{ui.data.context.work.find(ctx=>ctx.id===work.id)?.site_label ?? 'Location not specified'} · {opsLabel(work.status)}</p>
            <button type="button" className="text-button" onClick={()=>ui.open('work_detail',work.id)}>Review urgent repair</button>
          </article>)}
        </details>}
        {overdueRepairs.length > 0 && <details>
          <summary>Past-due maintenance alerts ({overdueRepairs.length})</summary>
          {overdueRepairs.slice(0, 20).map(work => <article className="ops-history" key={work.id}>
            <strong>Due {work.due_on}</strong> · {work.number} · {work.title}
            <button type="button" className="text-button" onClick={()=>ui.open('work_detail',work.id)}>Review overdue repair</button>
          </article>)}
        </details>}
        <p>Alerts reflect current saved records. Resolve work through its existing workflow and confirm inspection outcomes separately.</p>
      </section>
      <section className="ops-record" aria-label="Property safety dashboard">
        <h3>Property safety dashboard</h3>
        <p>Current saved checklist findings and high-priority work orders for this property. A skipped item is a review flag, not proof of a safety defect. Findings may need checking against repair history before being considered resolved.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Failed inspection findings</span><strong>{failedFindings.length}</strong></div>
          <div className="stat-card"><span>Needs-attention findings</span><strong>{needsAttention.length}</strong></div>
          <div className="stat-card"><span>Other skipped checks</span><strong>{inspectionFindings.length - failedFindings.length - needsAttention.length}</strong></div>
          <div className="stat-card"><span>Open urgent / high-priority repairs</span><strong>{priorityRepairs.length}</strong></div>
        </div>
        <div className="action-group">
          <label>Filter inspection findings
            <select value={safetyFilter} onChange={(event) => setSafetyFilter(event.target.value as typeof safetyFilter)}>
              <option value="all">All findings</option>
              <option value="failed">Failed inspections</option>
              <option value="attention">Needs attention</option>
              <option value="skipped">Skipped checks</option>
            </select>
          </label>
        </div>
        <details open>
          <summary>Inspect saved findings ({visibleFindings.length})</summary>
          {!visibleFindings.length && <p>No checklist findings match this filter.</p>}
          {visibleFindings.slice(0, 30).map((finding) => (
            <article className="ops-history" key={finding.id}>
              <strong>{finding.severity}</strong> · {finding.run.scheduled_for} · {finding.item.label}
              <p>{finding.run.label} · {finding.entry.notes}</p>
              <button type="button" className="text-button" onClick={() => ui.open('run_detail', finding.run.id)}>
                Open inspection and related repairs
              </button>
            </article>
          ))}
          {visibleFindings.length > 30 && <p>Showing the 30 most recent matching findings. Open a checklist run to review its complete history.</p>}
        </details>
        <details>
          <summary>High-priority maintenance queue ({priorityRepairs.length})</summary>
          {!priorityRepairs.length && <p>No open urgent or high-priority work orders recorded.</p>}
          {priorityRepairs.slice(0, 30).map((work) => (
            <article className="ops-history" key={work.id}>
              <strong>{opsLabel(work.priority)}</strong> · {work.number} · {work.title}
              <p>{opsLabel(work.status)} · {ui.data.context.work.find((ctx) => ctx.id === work.id)?.site_label ?? 'Location not specified'} · Due {work.due_on ?? 'Not scheduled'}</p>
              <button type="button" className="text-button" onClick={() => ui.open('work_detail', work.id)}>
                View work order and photo evidence
              </button>
            </article>
          ))}
          {priorityRepairs.length > 30 && <p>Showing 30 work orders; see Maintenance for the full queue.</p>}
        </details>
      </section>
      <section className="ops-record" aria-label="Property inspection and safety center">
        <h3>Property inspection &amp; safety center</h3>
        <p>Use a saved recurring checklist plan to record inspections. These categories are suggested inspection items, not completed checks or certified safety assessments.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Open inspection runs</span><strong>{scoped(ui, ui.data.runs).filter((run) => run.status === 'open').length}</strong></div>
          <div className="stat-card"><span>Overdue inspection runs</span><strong>{scoped(ui, ui.data.runs).filter((run) => run.status === 'open' && run.scheduled_for < ui.today).length}</strong></div>
          <div className="stat-card"><span>Unrecorded checklist items</span><strong>{scoped(ui, ui.data.runs).filter((run) => run.status === 'open').reduce((count, run) => count + run.items.filter((item) => !['done', 'skipped'].includes(checklistState(ui.data.entries, run.id, item.key)?.status ?? '')).length, 0)}</strong></div>
        </div>
        <details>
          <summary>RV site inspection guide</summary>
          <ul>
            <li>Electrical pedestal: visible damage, covers and exposed wiring; refer hazards to qualified personnel</li>
            <li>Water hookups: leaks, damaged fittings, hose connections and standing water</li>
            <li>Sewer connections: leaks, damaged caps, odor or overflow concerns</li>
            <li>Parking pad and site: trip hazards, branches, debris and lighting</li>
          </ul>
        </details>
        <details>
          <summary>Bathhouse and laundry inspection guide</summary>
          <ul>
            <li>Restrooms: cleanliness, fixtures, drains, soap, paper goods and accessibility concerns</li>
            <li>Laundry: machine leaks, lint buildup, floor conditions and ventilation concerns</li>
            <li>Common areas: trash overflow, damaged surfaces, signage and lighting</li>
          </ul>
        </details>
        <details>
          <summary>Grounds, landscaping and safety guide</summary>
          <ul>
            <li>Sprinklers: broken heads, leaks, overspray and damaged irrigation</li>
            <li>Trees and paths: fallen limbs, obstructed walkways and trip hazards</li>
            <li>Safety equipment: visible extinguisher condition, access routes and emergency signage; follow applicable inspection rules</li>
            <li>Emergency access: blocked roads, exits, hydrants or service areas</li>
          </ul>
        </details>
        <div className="action-group">
          {ui.manage && ui.active && <Action click={() => ui.open('save_plan', undefined, undefined, 'checklist')}>Create inspection checklist</Action>}
          {ui.office && ui.active && <Action click={() => ui.open('new_work')}>Report inspection repair</Action>}
          {!ui.office && ui.active && <Action click={() => ui.open('maintenance_self_task')}>Create my repair task</Action>}
        </div>
        <p>Record dated item results in the checklist run below. Link repair notes and before/after photos to the existing work order. For suspected electrical, gas or fire hazards, isolate the area and follow your emergency and qualified-contractor procedures.</p>
      </section>
      {!scoped(ui, ui.data.runs).length ? (
        <Empty title="No checklist runs">
          Create a recurring checklist plan, then create an occurrence from the calendar.
        </Empty>
      ) : (
        scoped(ui, ui.data.runs)
          .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
          .map((r) => {
            const complete = r.items.filter((i) =>
              ['done', 'skipped'].includes(checklistState(ui.data.entries, r.id, i.key)?.status ?? '')
            ).length;
            return (
              <article className="ops-record" key={r.id}>
                <h3>
                  <button className="text-button" onClick={() => ui.open('run_detail', r.id)}>
                    {r.label}
                  </button>
                </h3>
                <p>
                  {r.scheduled_for} · {staffName(ui, r.assigned_to)} · {opsLabel(r.status)} · {complete}/
                  {r.items.length} recorded
                </p>
                {r.scheduled_for < ui.today && r.status === 'open' && (
                  <p className="ops-overdue">Overdue checklist</p>
                )}
              </article>
            );
          })
      )}
    </section>
  );
}
export function RunDetail({ ui, id }: { ui: OpsUI; id: string }) {
  const r = ui.data.runs.find((r) => r.id === id);
  if (!r) return <p>Checklist unavailable.</p>;
  return (
    <>
      <h3>{r.label}</h3>
      <p>
        {r.scheduled_for} · {staffName(ui, r.assigned_to)} · {opsLabel(r.status)}
      </p>
      <p>Record Pass, Fail or Needs attention for each inspection item. Fail and Needs attention are saved as skipped checklist outcomes with a labeled finding in retained notes, not as completed work. Repairs must still be created separately.</p>
      <div className="stat-grid" aria-label="Inspection results overview">
        <div className="stat-card"><span>Completed items</span><strong>{r.items.filter((item) => checklistState(ui.data.entries, id, item.key)?.status === 'done').length}</strong></div>
        <div className="stat-card"><span>Skipped / follow-up</span><strong>{r.items.filter((item) => checklistState(ui.data.entries, id, item.key)?.status === 'skipped').length}</strong></div>
        <div className="stat-card"><span>Not recorded</span><strong>{r.items.filter((item) => !['done','skipped'].includes(checklistState(ui.data.entries, id, item.key)?.status ?? '')).length}</strong></div>
      </div>
      {r.items.map((i) => {
        const state = checklistState(ui.data.entries, id, i.key);
        return (
          <section className="ops-record" key={i.key}>
            <h3>{i.label}</h3>
            <p>
              {state?.notes.startsWith('[Inspection: ') ? state.notes.split(']')[0].replace('[Inspection: ', '') :
                state ? opsLabel(state.status) : 'Not recorded'} · {state?.notes}
            </p>
            {ui.active && r.status === 'open' && r.scheduled_for <= ui.today && (
              <div className="action-group">
                {(!state || state.status === 'reopen') && (
                  <>
                    <Action click={() => ui.open('checklist_entry', id, i.key, 'done')}>Complete item</Action>
                    <Action click={() => ui.open('checklist_entry', id, i.key, 'pass')}>Pass inspection</Action>
                    <Action click={() => ui.open('checklist_entry', id, i.key, 'fail')}>Fail</Action>
                    <Action click={() => ui.open('checklist_entry', id, i.key, 'needs_attention')}>Needs attention</Action>
                    <Action click={() => ui.open('checklist_entry', id, i.key, 'skipped')}>Skip with reason</Action>
                  </>
                )}
                {ui.office && state && state.status !== 'reopen' && (
                  <Action click={() => ui.open('checklist_entry', id, i.key, 'reopen')}>Reopen item</Action>
                )}
              </div>
            )}
            <div className="action-group">
              {ui.office && ui.active && (
                <Action click={() => ui.open('new_work')}>Create repair for this inspection finding</Action>
              )}
              {!ui.office && ui.active && (
                <Action click={() => ui.open('maintenance_self_task')}>Report repair as my task</Action>
              )}
            </div>
            <small>When reporting a repair, include this inspection date, checklist name and item in the request description so staff can find the original checklist. The new work order is not automatically linked to this item.</small>
            <details>
              <summary>Item history</summary>
              {ui.data.entries
                .filter((e) => e.run_id === id && e.item_key === i.key)
                .map((e) => (
                  <p key={e.id}>
                    {e.created_at} · {opsLabel(e.status)} · {e.notes} · {e.created_by}
                  </p>
                ))}
            </details>
          </section>
        );
      })}
      <InspectionLocation ui={ui} runId={id} />
      <InspectionRepairLinks ui={ui} runId={id} items={r.items} />
      <div className="action-group">
        {ui.active && r.status === 'open' && (
          <Action click={() => ui.open('checklist_status', id, undefined, 'closed')}>
            Close checklist run
          </Action>
        )}
        {ui.office && ui.active && r.status !== 'open' && (
          <Action click={() => ui.open('checklist_status', id, undefined, 'open')}>
            Reopen checklist run
          </Action>
        )}
        {ui.office && ui.active && r.status === 'open' && (
          <Action click={() => ui.open('checklist_status', id, undefined, 'cancelled')}>
            Cancel checklist run
          </Action>
        )}
      </div>
    </>
  );
}
export function PlansPanel({
  ui,
  starts,
  ends,
  setRange,
}: {
  ui: OpsUI;
  starts: string;
  ends: string;
  setRange: (start: string, end: string) => void;
}) {
  const reminderThrough = new Date(Date.parse(ui.today+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
  const reminders = preventiveReminders(ui.data.equipment,ui.data.plans,ui.propertyId,ui.today,reminderThrough);
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
  const [anchorDay, setAnchorDay] = useState(ui.today);
  const [employee, setEmployee] = useState('all');
  const occurrences = scoped(ui, ui.data.schedule);
  const dayDate = new Date(anchorDay + 'T12:00:00Z');
  const weekStart = new Date(dayDate);
  weekStart.setUTCDate(dayDate.getUTCDate() - ((dayDate.getUTCDay() + 6) % 7));
  const displayStart = calendarView === 'day' ? anchorDay :
    calendarView === 'week' ? weekStart.toISOString().slice(0, 10) : anchorDay.slice(0, 7) + '-01';
  const displayEnd = calendarView === 'day' ? anchorDay :
    calendarView === 'week' ? new Date(weekStart.getTime() + 6 * 86400000).toISOString().slice(0, 10) :
    new Date(Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const planAssignee = new Map(ui.data.plans.filter((p) => p.property_id === ui.propertyId).map((p) => [p.id, p.assigned_to]));
  const visibleOccurrences = occurrences.filter((o) => o.scheduled_for >= displayStart &&
    o.scheduled_for <= displayEnd && (employee === 'all' || planAssignee.get(o.plan_id) === employee));
  const scheduledWork = scoped(ui, ui.data.work).filter((w) =>
    !!w.scheduled_for && w.scheduled_for >= starts && w.scheduled_for <= ends &&
    !['cancelled', 'closed'].includes(w.status)
  );
  const filteredWork = scheduledWork.filter((w) => w.scheduled_for! >= displayStart &&
    w.scheduled_for! <= displayEnd && (employee === 'all' || w.assigned_to === employee));
  const days = [...new Set([
    ...filteredWork.map((w) => w.scheduled_for!),
    ...visibleOccurrences.map((o) => o.scheduled_for),
  ])].sort();
  return (
    <>
      <section className="panel" aria-label="Preventive maintenance due reminders">
        <h2>Preventive maintenance reminders</h2>
        <p>Equipment service dates and the next planned recurring occurrence for the next seven days. Recurring dates are reminders, not evidence that a saved task was missed.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Equipment service overdue</span><strong>{reminders.filter(x=>x.kind==='equipment'&&x.state==='overdue').length}</strong></div>
          <div className="stat-card"><span>Due within seven days</span><strong>{reminders.filter(x=>x.state==='upcoming').length}</strong></div>
        </div>
        {!reminders.length?<p>No dated preventive equipment or active plan reminders found in this window.</p>:
          <div className="table-wrap" role="region" aria-label="Upcoming preventive work" tabIndex={0}>
            <table><thead><tr><th>Work</th><th>Type</th><th>Due</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>{reminders.map(item=><tr key={item.kind+item.id}>
              <th scope="row">{item.label}</th><td>{item.kind==='equipment'?'Equipment service':'Recurring plan'}</td>
              <td>{item.date}</td><td>{item.state==='overdue'?'Overdue':'Upcoming'}</td>
              <td><button type="button" className="button secondary" onClick={()=>ui.open(item.kind==='equipment'?'equipment_detail':'save_plan',item.id)}>Open record</button></td>
            </tr>)}</tbody></table>
          </div>}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recurring plans</h2>
            <p>
              Preventive work and custom checklists use explicit day intervals. Create due or future
              occurrences once.
            </p>
          </div>
          {ui.manage && ui.active && <Action click={() => ui.open('save_plan')}>Add recurring plan</Action>}
        </div>
        {scoped(ui, ui.data.plans).map((p) => (
          <article className="ops-record" key={p.id}>
            <h3>
              {p.label} · {opsLabel(p.kind)}
              {p.active ? '' : ' · Paused'}
            </h3>
            <p>
              Every {p.interval_days} days from {p.anchor_on}
              {p.ends_on ? ` through ${p.ends_on}` : ''} · {staffName(ui, p.assigned_to)}
            </p>
            <p>{p.description}</p>
            {ui.manage && ui.active && (
              <Action click={() => ui.open('save_plan', p.id)}>Edit recurring plan</Action>
            )}
          </article>
        ))}
      </section>
      <section className="panel" aria-label="Scheduled maintenance agenda">
        <h2>Employee maintenance calendar</h2>
        <p>Switch between daily, weekly, and monthly schedules. Jobs stay in existing work orders; tap one to view or edit its assignment and date.</p>
        <div className="meter-controls">
          <label>View
            <select value={calendarView} onChange={(e) => setCalendarView(e.target.value as 'day' | 'week' | 'month')}>
              <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
            </select>
          </label>
          <label>Choose date<input type="date" value={anchorDay} onChange={(e) => setAnchorDay(e.target.value || ui.today)} /></label>
          <label>Assigned employee
            <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="all">Whole crew</option>
              {scoped(ui, ui.data.staff).map((staff) => <option key={staff.user_id} value={staff.user_id}>{staff.name}</option>)}
            </select>
          </label>
        </div>
        <p>Showing {displayStart} through {displayEnd}. {displayStart < starts || displayEnd > ends ?
          'Part of this view falls outside the loaded range; expand Calendar starts/ends below to load all dates.' :
          'All displayed dates are in the loaded range.'}</p>
        {!days.length ? <p>No work orders or recurring tasks scheduled within the loaded date range.</p> : days.map((day) => (
          <details className="ops-record" key={day} open={day === ui.today}>
            <summary>{day} — {filteredWork.filter((w) => w.scheduled_for === day).length} work orders, {visibleOccurrences.filter((o) => o.scheduled_for === day).length} recurring tasks</summary>
            {filteredWork.filter((w) => w.scheduled_for === day).map((w) => (
              <article key={w.id} className="ops-history">
                <button className="text-button" onClick={() => ui.open('work_detail', w.id)}>{w.number} · {w.title}</button>
                <p><span className="badge" data-priority={w.priority}>{opsLabel(w.priority)}</span> · {opsLabel(w.status)} · {staffName(ui, w.assigned_to)}</p>
                <p>{ui.data.context.work.find((x) => x.id === w.id)?.site_label ?? 'Common area'} · {w.parts_required ? 'Parts: ' + w.parts_required : 'No parts noted'}</p>
              </article>
            ))}
            {visibleOccurrences.filter((o) => o.scheduled_for === day).map((o) => (
              <article key={o.plan_id + ':' + day} className="ops-history">
                <p><strong>{o.label}</strong> · Recurring {opsLabel(o.kind)}</p>
                {o.entity_id ? <Action click={() => ui.open(o.kind === 'maintenance' ? 'work_detail' : 'run_detail', o.entity_id!)}>Open scheduled task</Action> :
                  ui.office && ui.active ? <Action click={() => ui.open('generate_occurrence', o.plan_id, undefined, day)}>Create scheduled task</Action> :
                  <p>Not yet created</p>}
              </article>
            ))}
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Maintenance & checklist calendar</h2>
        <div className="meter-controls">
          <label>
            Calendar starts
            <input type="date" value={starts} onChange={(e) => setRange(e.target.value, ends)} />
          </label>
          <label>
            Calendar ends
            <input type="date" value={ends} onChange={(e) => setRange(starts, e.target.value)} />
          </label>
        </div>
        <p>
          Maximum 366 days. Changing the range reloads the calendar. Uncreated past occurrences remain visible
          as overdue; the system does not create or complete them automatically.
        </p>
        {!occurrences.length ? (
          <p>No active scheduled occurrences in this range.</p>
        ) : (
          <HistoryTable
            label="Recurring operations calendar"
            headers={['Date', 'Plan', 'Occurrence']}
            rows={occurrences.map((o) => ({
              id: `${o.plan_id}:${o.scheduled_for}`,
              cells: [
                <>
                  {o.scheduled_for}
                  {!o.entity_id && o.scheduled_for < ui.today && (
                    <small className="ops-overdue">Overdue, not created</small>
                  )}
                </>,
                <>
                  {o.label}
                  <small>{opsLabel(o.kind)}</small>
                </>,
                o.entity_id ? (
                  <Action
                    click={() =>
                      ui.open(o.kind === 'maintenance' ? 'work_detail' : 'run_detail', o.entity_id!)
                    }
                  >
                    Open occurrence
                  </Action>
                ) : ui.office && ui.active ? (
                  <Action click={() => ui.open('generate_occurrence', o.plan_id, undefined, o.scheduled_for)}>
                    Create occurrence
                  </Action>
                ) : (
                  'Awaiting manager scheduling'
                ),
              ],
            }))}
          />
        )}
      </section>
    </>
  );
}
export function TeamPanel({ ui }: { ui: OpsUI }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Staff & work history</h2>
          <p>
            Profiles use existing registered accounts and property roles. Employment status and account access
            are separate controls.
          </p>
        </div>
        {ui.manage && ui.active && <Action click={() => ui.open('save_staff')}>Add staff profile</Action>}
      </div>
      {scoped(ui, ui.data.staff).map((s) => (
        <article className="ops-record" key={s.id}>
          <h3>
            {s.name} · {s.employee_code}
          </h3>
          <p>
            {opsLabel(s.employment_status)} · Role{' '}
            {opsLabel(
              ui.data.context.roles.find((r) => r.user_id === s.user_id && r.property_id === s.property_id)
                ?.role ?? 'No current access'
            )}{' '}
            · Start {s.starts_on}
          </p>
          <p>
            {s.email} · {s.phone}
          </p>
          <p>Supervisor {s.supervisor_id ? staffName(ui, s.supervisor_id) : 'Not assigned'}</p>
          <p>{s.notes}</p>
          <small>User ID {s.user_id}</small>
          {ui.manage && ui.active && (
            <p>
              <Action click={() => ui.open('save_staff', s.id)}>Edit staff profile</Action>
            </p>
          )}
          <details>
            <summary>Assigned work & activity</summary>
            {scoped(ui, ui.data.work)
              .filter((w) => w.assigned_to === s.user_id)
              .map((w) => (
                <p key={w.id}>
                  <button className="text-button" onClick={() => ui.open('work_detail', w.id)}>
                    {w.number}
                  </button>{' '}
                  · {w.title} · {opsLabel(w.status)}
                </p>
              ))}
            <p>
              Recorded work time{' '}
              {ui.data.events
                .filter((e) => e.created_by === s.user_id && e.property_id === s.property_id)
                .reduce((n, e) => n + e.minutes, 0)}{' '}
              minutes
            </p>
            {ui.data.runs
              .filter((r) => r.assigned_to === s.user_id && r.property_id === s.property_id)
              .map((r) => (
                <p key={r.id}>
                  {r.label} · {r.scheduled_for} · {opsLabel(r.status)}
                </p>
              ))}
          </details>
        </article>
      ))}
    </section>
  );
}
export function NotificationsPanel({ ui, read }: { ui: OpsUI; read: (id: string) => Promise<void> }) {
  const [pending, setPending] = useState(''),
    [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>My operational notifications</h2>
      <p>
        Private in-app assignments and completion alerts. No email, text message or customer notice is sent.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {scoped(ui, ui.data.notifications)
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((n) => (
          <article className="ops-record" key={n.id}>
            <h3>
              {n.title}
              {n.read_at ? '' : ' · Unread'}
            </h3>
            <p>{n.body}</p>
            <small>{n.created_at}</small>
            <div className="action-group">
              {n.work_order_id && (
                <Action click={() => ui.open('work_detail', n.work_order_id!)}>Open work order</Action>
              )}
              {n.run_id && <Action click={() => ui.open('run_detail', n.run_id!)}>Open checklist</Action>}
              {ui.active && !n.read_at && (
                <Action
                  disabled={!!pending}
                  click={async () => {
                    setPending(n.id);
                    setError('');
                    try {
                      await read(n.id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Notification update unavailable.');
                    } finally {
                      setPending('');
                    }
                  }}
                >
                  Mark read
                </Action>
              )}
            </div>
          </article>
        ))}
    </section>
  );
}
export function HistoryTable({
  label,
  headers,
  rows,
}: {
  label: string;
  headers: string[];
  rows: { id: string; cells: React.ReactNode[] }[];
}) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {r.cells.map((cell, index) =>
                index === 0 ? (
                  <th scope="row" key={index}>
                    {cell}
                  </th>
                ) : (
                  <td key={index}>{cell}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No history records.</p>}
    </div>
  );
}

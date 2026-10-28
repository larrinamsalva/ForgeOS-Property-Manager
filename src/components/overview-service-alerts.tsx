'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@/lib/domain';
import { canEditProperty, dateAtProperty, csv } from '@/lib/domain';
import { quantity, type OperationsSnapshot } from '@/lib/operations-domain';
import { lowStockInventory, lowStockInventoryLink } from '@/lib/low-stock-inventory';
import { existingRestockRequests } from '@/lib/existing-restock-requests';
import { incomingDeliveryLines, incomingDeliveriesLink, incomingDeliveryOrderLink } from '@/lib/incoming-deliveries';
import { incomingStockCoverage } from '@/lib/incoming-stock-coverage';
import { waitingRepairsWithoutPartRequests } from '@/lib/work-parts-request-review';
import { waitingPartsHandoff, waitingPartsReasonLabels } from '@/lib/waiting-parts-handoff';
import {
  filterWaitingPartsRows,waitingPartsCsvRows,waitingPartsFilterChoices,
  type WaitingPartsViewFilter,
} from '@/lib/waiting-parts-handoff-review';
import { latestReview, type MeterSnapshot } from '@/lib/meter-domain';
import { propertyMaintenancePriorities, propertyMaintenanceTriageLink } from '@/lib/property-maintenance-priorities';
import { overviewMaintenancePriorityQueue } from '@/lib/overview-maintenance-priority-queue';
import { siteMaintenanceWorkLink } from '@/lib/site-maintenance-focus';

type Load<T> = { status: 'loading' | 'ready' | 'unavailable'; data?: T };
export function OverviewServiceAlerts({ snapshot, propertyId, href }: {
  snapshot: Snapshot;
  propertyId: string;
  href: (target: string, property?: string) => string;
}) {
  const [operations, setOperations] = useState<Load<OperationsSnapshot>>({ status: 'loading' });
  const [meters, setMeters] = useState<Load<MeterSnapshot>>({ status: 'loading' });
  const [waitingFilter,setWaitingFilter]=useState<WaitingPartsViewFilter>('all');
  const [waitingProperty,setWaitingProperty]=useState('all');
  const [waitingSearch,setWaitingSearch]=useState('');
  const [waitingVisibleLimit,setWaitingVisibleLimit]=useState(10);
  const authorized = snapshot.properties.filter((p) =>
    !p.archived_at && (!propertyId || p.id === propertyId) &&
    (canEditProperty(snapshot, p.id, true) ||
      snapshot.propertyMemberships.some((m) => m.user_id === snapshot.userId && m.property_id === p.id && m.role === 'maintenance'))
  );
  const authorizedIds = new Set(authorized.map((p) => p.id));
  useEffect(() => {
    const controller = new AbortController();
    async function load<T>(path: string, setter: (v: Load<T>) => void) {
      try {
        const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json() as T;
        if (!controller.signal.aborted) setter({ status: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setter({ status: 'unavailable' });
      }
    }
    if (!authorizedIds.size) return;
    load<OperationsSnapshot>('/api/operations?organization=' + encodeURIComponent(snapshot.organizationId), setOperations);
    load<MeterSnapshot>('/api/meters?organization=' + encodeURIComponent(snapshot.organizationId), setMeters);
    return () => controller.abort();
  // Scope to the currently selected authorized property; no access without a matching staff role.
  }, [snapshot.organizationId, propertyId, snapshot.userId, authorizedIds.size]);
  if (!authorizedIds.size) return null;
  const openWork = operations.data?.work.filter((w) => authorizedIds.has(w.property_id) &&
    !['completed', 'closed', 'cancelled'].includes(w.status)) ?? [];
  const overdue = openWork.filter((w) => {
    const property = authorized.find((p) => p.id === w.property_id);
    return !!w.due_on && !!property && w.due_on < dateAtProperty(property.timezone);
  }).length;
  const unassigned = openWork.filter((w) => !w.assigned_to).length;
  const priorities=operations.data?propertyMaintenancePriorities(operations.data.work,authorized):[];
  const priorityQueue=operations.data?overviewMaintenancePriorityQueue(operations.data.work,authorized):null;
  const siteFor=(siteId:string|null,propertyId:string)=>snapshot.sites.find(site=>
    site.id===siteId&&site.property_id===propertyId);
  const repairLocation=(siteId:string|null,propertyId:string)=>{
    const site=siteId?siteFor(siteId,propertyId):undefined;
    return site?.label??'Property / common area';
  };
  const lowStock=operations.data
    ?lowStockInventory(operations.data.items,operations.data.summary.stock,[...authorizedIds])
    :[];
  const lowStockByProperty=new Map(authorized.map(property=>[
    property.id,lowStock.filter(row=>row.item.property_id===property.id).length,
  ]));
  const incoming=operations.data
    ?incomingDeliveryLines(operations.data.orders,operations.data.lines,
      operations.data.summary.purchase_lines,authorized)
    :[];
  const incomingByProperty=new Map(authorized.map(property=>[
    property.id,incoming.filter(row=>row.order.property_id===property.id).length,
  ]));
  const waitingQueue=operations.data
    ?waitingPartsHandoff(
      operations.data.work,operations.data.requests,operations.data.items,
      operations.data.summary.stock,operations.data.orders,operations.data.lines,
      operations.data.summary.purchase_lines,authorized,
      new Date(),Number.MAX_SAFE_INTEGER,
    ) : null;
  const waitingAll=waitingQueue?.rows??[];
  const activeWaitingProperty=waitingProperty==='all'||authorizedIds.has(waitingProperty)
    ?waitingProperty:'all';
  const waitingFiltered=filterWaitingPartsRows(
    waitingAll,waitingFilter,activeWaitingProperty==='all'?'':activeWaitingProperty,waitingSearch,
  );
  const waitingVisible=waitingFiltered.slice(0,waitingVisibleLimit);
  const exportWaitingVisible=()=>{
    if(!waitingVisible.length)return;
    const text=csv(waitingPartsCsvRows(waitingVisible,authorized,snapshot.sites));
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download='forgeos-visible-waiting-repairs.csv';
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const workPartsGaps=operations.data
    ?waitingRepairsWithoutPartRequests(operations.data.work,operations.data.requests,[...authorizedIds])
    :{waiting:0,withoutRequest:0};
  const supplyCoverage=incomingStockCoverage(lowStock,incoming);
  const shortagesWithoutPlacedOrders=supplyCoverage.filter(row=>!row.placedOrderIds.length).length;
  const shortagesWithLateOrders=supplyCoverage.filter(row=>row.overdueOrderCount>0).length;
  const oneProperty=authorized.length===1?authorized[0]:null;
  const attentionTarget=(triage:'overdue'|'unassigned'|'waiting_parts')=>oneProperty
    ?propertyMaintenanceTriageLink(snapshot.organizationId,oneProperty.id,triage)
    :'#maintenance-property-handoff';
  const scopedReadings = meters.data?.readings.filter(r => authorizedIds.has(r.property_id)) ?? [];
  const pendingReviews = scopedReadings.filter(r => !latestReview(r.id, meters.data!.reviews)).length;
  const reviewedReadings = scopedReadings.filter(r => !!latestReview(r.id, meters.data!.reviews)).length;
  const metric = (load: Load<unknown>, value: number) =>
    load.status === 'ready' ? String(value) : load.status === 'loading' ? 'Checking…' : 'Unavailable';
  return <section className="panel" aria-label="Maintenance and meter alerts">
    <h2>Maintenance &amp; meter alerts</h2>
    <p>Live staff queues from authorized property records. Missing data is never shown as zero.</p>
    <div className="stat-grid">
      <div className="stat-card"><span>Open maintenance orders</span><strong>{metric(operations, openWork.length)}</strong>
        <Link href={href('maintenance')}>Open maintenance board</Link></div>
      <div className="stat-card"><span>Overdue maintenance</span><strong>{metric(operations, overdue)}</strong>
        <Link href={attentionTarget('overdue')}>{oneProperty?'Review overdue queue':'Choose a property below'}</Link></div>
      <div className="stat-card"><span>Unassigned work orders</span><strong>{metric(operations, unassigned)}</strong>
        <Link href={attentionTarget('unassigned')}>{oneProperty?'Review unassigned queue':'Choose a property below'}</Link></div>
      <div className="stat-card"><span>Waiting repairs without recorded parts requests</span>
        <strong>{metric(operations,workPartsGaps.withoutRequest)}</strong>
        <Link href={attentionTarget('waiting_parts')}>{oneProperty?'Review waiting repairs':'Choose a property below'}</Link>
      </div>
      <div className="stat-card"><span>Supplies at reorder threshold</span><strong>{metric(operations,lowStock.length)}</strong>
        <Link href={oneProperty?lowStockInventoryLink(snapshot.organizationId,oneProperty.id):'#inventory-reorder-handoff'}>
          {oneProperty?'Review low-stock items':'Choose property below'}
        </Link>
      </div>
      <div className="stat-card"><span>Low-stock supplies with no placed order</span>
        <strong>{metric(operations,shortagesWithoutPlacedOrders)}</strong>
        <Link href={oneProperty?lowStockInventoryLink(snapshot.organizationId,oneProperty.id):'#inventory-reorder-handoff'}>
          {oneProperty?'Review uncovered shortages':'See shortages by property'}
        </Link>
      </div>
      <div className="stat-card"><span>Low-stock supplies with delayed orders</span>
        <strong>{metric(operations,shortagesWithLateOrders)}</strong>
        <Link href={oneProperty?incomingDeliveriesLink(snapshot.organizationId,oneProperty.id):'#inventory-reorder-handoff'}>
          {oneProperty?'Review delayed supply orders':'See shortages by property'}
        </Link>
      </div>
      <div className="stat-card"><span>Supplier lines awaiting receipt</span>
        <strong>{metric(operations,incoming.length)}</strong>
        <Link href={oneProperty?incomingDeliveriesLink(snapshot.organizationId,oneProperty.id):'#incoming-deliveries-handoff'}>
          {oneProperty?'Review incoming supplies':'Choose property below'}
        </Link>
      </div>
      <div className="stat-card"><span>Meter readings reviewed</span><strong>{metric(meters, reviewedReadings)}</strong>
        <Link href={href('meters')}>View meter history</Link></div>
      <div className="stat-card"><span>Meter readings awaiting review</span><strong>{metric(meters, pendingReviews)}</strong>
        <Link href={href('meters')}>Review readings</Link></div>
    </div>
    <div id="maintenance-property-handoff" className="ops-record" aria-label="Maintenance priority handoff by property">
      <h3>Maintenance priorities by property</h3>
      <p>Start with overdue repairs, then urgent and due-today work. Counts exclude completed, closed and cancelled jobs and use each property&apos;s local calendar date.</p>
      {operations.status==='ready' ? (
        <div className="table-wrap" role="region" aria-label="Per-property maintenance attention links" tabIndex={0}>
          <table>
            <thead><tr><th>Property</th><th>Open repairs</th><th>Overdue</th><th>Urgent</th><th>Due today</th><th>Unassigned</th><th>Waiting for parts</th></tr></thead>
            <tbody>{priorities.map(row=>(
              <tr key={row.propertyId}>
                <th scope="row">
                  {authorized.find(p=>p.id===row.propertyId)?.name??'Property'}
                  <small>Local date: {row.propertyToday}</small>
                  <Link href={href('maintenance',row.propertyId)}>All work orders</Link>
                </th>
                <td>{row.open}</td>
                <td><Link href={propertyMaintenanceTriageLink(snapshot.organizationId,row.propertyId,'overdue')}>Overdue ({row.overdue})</Link></td>
                <td><Link href={propertyMaintenanceTriageLink(snapshot.organizationId,row.propertyId,'urgent')}>Urgent ({row.urgent})</Link></td>
                <td><Link href={propertyMaintenanceTriageLink(snapshot.organizationId,row.propertyId,'due_today')}>Due today ({row.dueToday})</Link></td>
                <td><Link href={propertyMaintenanceTriageLink(snapshot.organizationId,row.propertyId,'unassigned')}>Unassigned ({row.unassigned})</Link></td>
                <td><Link href={propertyMaintenanceTriageLink(snapshot.organizationId,row.propertyId,'waiting_parts')}>Waiting for parts ({row.waitingParts})</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ):<p role="status">{operations.status==='loading'?'Checking property maintenance priorities…':'Maintenance records unavailable; no priority counts assumed.'}</p>}
      <p className="muted small">Select a property row to open the matching authorized maintenance worklist. Opening a queue does not assign, approve or change a repair.</p>
    </div>
    <div className="ops-record" aria-label="Today's priority maintenance worklist">
      <h3>Next maintenance repairs to review</h3>
      <p>Urgent, overdue and due-today repairs from your authorized properties, ordered by urgency. A repair appears once even if it matches several alerts. The due dates are checked using each property&apos;s local calendar day.</p>
      {operations.status==='ready' && priorityQueue ? (
        priorityQueue.total===0 ? <p>No active urgent, overdue or due-today repairs in the loaded maintenance records.</p> :
        <>
          <p role="status">Showing {priorityQueue.rows.length} of {priorityQueue.total} attention-needed repairs.</p>
          <div className="table-wrap" role="region" aria-label="Next maintenance repairs" tabIndex={0}>
            <table>
              <thead><tr><th>Repair</th><th>Property / space</th><th>Attention</th><th>Due</th><th>Action</th></tr></thead>
              <tbody>{priorityQueue.rows.map(row=>{
                const work=row.work;
                const site=work.site_id?siteFor(work.site_id,work.property_id):undefined;
                const propertyName=authorized.find(p=>p.id===work.property_id)?.name??'Property';
                const queueFilter=row.reason.includes('Urgent')?'urgent':
                  row.reason==='Overdue'?'overdue':'due_today';
                return <tr key={work.id}>
                  <th scope="row">{work.number}<small>{work.title}</small></th>
                  <td>{propertyName}<small>{repairLocation(work.site_id,work.property_id)}</small></td>
                  <td>{row.reason}<small>{work.status.replaceAll('_',' ')}</small></td>
                  <td>{work.due_on??'Not scheduled'}
                    {row.daysOverdue>0&&<small className="ops-overdue">{row.daysOverdue} {row.daysOverdue===1?'day':'days'} overdue</small>}
                    <small>Local date: {row.propertyToday}</small>
                  </td>
                  <td>{site?
                    <Link href={siteMaintenanceWorkLink(snapshot.organizationId,work.property_id,site.id,work.id)}>Open repair</Link>:
                    <Link href={propertyMaintenanceTriageLink(snapshot.organizationId,work.property_id,queueFilter)}>Review property queue</Link>
                  }</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {priorityQueue.total>priorityQueue.rows.length&&
            <p className="muted small">Additional priority repairs remain in the property maintenance queues above.</p>}
        </>
      ):<p role="status">{operations.status==='loading'?'Checking maintenance priorities…':'Maintenance details unavailable; no repair entries assumed.'}</p>}
      <p className="muted small">A space-linked repair opens its existing authorized details. Common-area or no-longer-listed site repairs open the property queue instead; no action is taken until staff review and save changes.</p>
    </div>
    <div id="waiting-parts-repair-handoff" className="ops-record" aria-label="Waiting for parts repair follow-up">
      <h3>Repairs waiting for parts · manager handoff</h3>
      <p>Review repairs with documented parts delays and missing requests. Only exact recorded repair-to-request and request-to-order links are used; supply names and free-text notes never establish delivery coverage.</p>
      {operations.status==='ready' && waitingQueue ? (
        waitingQueue.total===0 ? <p>No repairs are currently marked Waiting for parts in these property records.</p>:
        <>
          <div className="action-group" role="group" aria-label="Waiting repair attention filters">
            {waitingPartsFilterChoices.map(choice=>
              <button key={choice.value} type="button"
                className={`button ${waitingFilter===choice.value?'primary':'secondary'}`}
                aria-pressed={waitingFilter===choice.value}
                onClick={()=>{setWaitingFilter(choice.value);setWaitingVisibleLimit(10);}}>
                {choice.label} ({filterWaitingPartsRows(
                  waitingAll,choice.value,activeWaitingProperty==='all'?'':activeWaitingProperty,'',
                ).length})
              </button>)}
          </div>
          <div className="action-group">
            {authorized.length>1&&<label>Property
              <select value={activeWaitingProperty} onChange={event=>{
                setWaitingProperty(event.target.value);setWaitingVisibleLimit(10);
              }}>
                <option value="all">All authorized properties</option>
                {authorized.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </label>}
            <label>Search waiting repairs
              <input type="search" value={waitingSearch} placeholder="Repair number, title or category"
                onChange={event=>{setWaitingSearch(event.target.value);setWaitingVisibleLimit(10);}}/>
            </label>
            <button className="button secondary" type="button"
              disabled={!waitingVisible.length} onClick={exportWaitingVisible}>
              Export visible repairs CSV ({waitingVisible.length})
            </button>
          </div>
          <p role="status">Showing {waitingVisible.length} of {waitingFiltered.length} matching repairs
            ({waitingQueue.total} waiting overall). Rows remain ordered by recorded attention reason.
            Filter counts include all repairs in the selected property before search.</p>
          {waitingFiltered.length===0?<p>No waiting repairs match these filters. Choose All waiting repairs, another property or clear the search.</p>:
          <div className="table-wrap" role="region" aria-label="Waiting repairs to review" tabIndex={0}>
            <table>
              <thead><tr><th>Repair / location</th><th>Why review</th><th>Request / order records</th><th>Due date</th><th>Next step</th></tr></thead>
              <tbody>{waitingVisible.map(row=>{
                const work=row.work;
                const site=work.site_id?siteFor(work.site_id,work.property_id):undefined;
                return <tr key={work.id}>
                  <th scope="row">{work.number}<small>{work.title}</small>
                    <small>{authorized.find(p=>p.id===work.property_id)?.name??'Property'} · {repairLocation(work.site_id,work.property_id)}</small>
                  </th>
                  <td><strong>{waitingPartsReasonLabels[row.reason]}</strong>
                    <small>{work.priority==='urgent'?'Urgent repair':work.priority==='high'?'High priority':'Maintenance follow-up'}</small>
                  </td>
                  <td>{row.linkedRequestCount} linked request(s)
                    <small>{row.openRequestCount} awaiting decision · {row.outstandingPlacedOrderCount} placed order(s) awaiting receipt</small>
                    {(row.lateOrderCount>0||row.noEtaOrderCount>0)&&
                      <small>{row.lateOrderCount} late · {row.noEtaOrderCount} no ETA</small>}
                    {row.hasRecordedOnHand&&<small>Some stock recorded on hand; not reserved for this repair</small>}
                  </td>
                  <td>{work.due_on??'Not scheduled'}
                    {work.due_on&&work.due_on<row.propertyToday&&<small className="ops-overdue">Repair overdue</small>}
                    <small>Local date: {row.propertyToday}</small>
                  </td>
                  <td>{site
                    ?<Link href={siteMaintenanceWorkLink(snapshot.organizationId,work.property_id,site.id,work.id)}>Review repair and parts</Link>
                    :<Link href={propertyMaintenanceTriageLink(snapshot.organizationId,work.property_id,'waiting_parts')}>Review property waiting queue</Link>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
          {waitingFiltered.length>waitingVisible.length&&
            <div className="action-group">
              <button type="button" className="button secondary"
                onClick={()=>setWaitingVisibleLimit(current=>current+10)}>
                Show 10 more repairs ({waitingFiltered.length-waitingVisible.length} remaining)
              </button>
            </div>}
        </>
      ):<p role="status">{operations.status==='loading'?'Checking repair parts blockers…':'Maintenance purchasing records unavailable; no repair blockers assumed.'}</p>}
      <p className="muted small">CSV contains only the displayed authorized repairs and omits resident records, contact fields and free-text notes. Staff-entered repair titles can contain sensitive details; review the file before sharing. Requests awaiting approval, placed orders and expected dates are not proof of delivered parts. This handoff does not allocate inventory, change repair status, or order supplies.</p>
    </div>
    <div id="inventory-reorder-handoff" className="ops-record" aria-label="Supplies needing restock">
      <h3>Supplies needing restock</h3>
      <p>Live stock balances at or below the saved reorder threshold, grouped by authorized property. Placed-order quantities are listed separately from physical on-hand stock; the gap assumes all outstanding units eventually arrive, which is not guaranteed.</p>
      {operations.status==='ready' ? <>
        <div className="action-group">
          {authorized.map(property=><Link className="button secondary" key={property.id}
            href={lowStockInventoryLink(snapshot.organizationId,property.id)}>
            {property.name}: {lowStockByProperty.get(property.id)??0} low-stock items
          </Link>)}
        </div>
        {!lowStock.length?<p>Nothing currently meets a reorder threshold in these properties.</p>:
          <>
            <p role="status">Showing {Math.min(lowStock.length,8)} of {lowStock.length} supplies to check, with out-of-stock items first.</p>
            <div className="table-wrap" role="region" aria-label="Current low-stock shopping priorities" tabIndex={0}>
              <table>
                <thead><tr><th>Property / supply</th><th>Available</th><th>Reorder point</th><th>Suggested restock</th><th>Existing requests</th><th>Placed orders / projected gap</th><th>Action</th></tr></thead>
                <tbody>{supplyCoverage.slice(0,8).map(({item,availableMilli,suggestedMilli,outOfStock,outstandingOnOrderMilli,gapIfReceivedMilli,placedOrderIds,overdueOrderCount,missingEtaOrderCount})=>{
                  const requests=existingRestockRequests(operations.data?.requests??[],item.property_id,item.id);
                  return <tr key={item.id}>
                    <th scope="row">{authorized.find(p=>p.id===item.property_id)?.name??'Property'}
                      <small>{item.name} · {item.sku}{outOfStock?' · Out of stock':''}</small></th>
                    <td>{quantity(availableMilli)} {item.unit}</td>
                    <td>{quantity(item.reorder_milli)} {item.unit}</td>
                    <td>{quantity(suggestedMilli)} {item.unit}</td>
                    <td>{requests.count ? `${requests.count} active request(s)` : 'None recorded'}</td>
                    <td>{placedOrderIds.length ? <>
                      <strong>{quantity(outstandingOnOrderMilli)} {item.unit} still on order</strong>
                      <small>{placedOrderIds.length} placed order(s){overdueOrderCount? ` · ${overdueOrderCount} late`:''}{missingEtaOrderCount? ` · ${missingEtaOrderCount} no ETA`:''}</small>
                    </> : 'No placed order recorded'}
                      <small>{quantity(gapIfReceivedMilli)} {item.unit} target gap if delivered</small>
                    </td>
                    <td><Link href={lowStockInventoryLink(snapshot.organizationId,item.property_id)}>Review stock / request restock</Link>
                      {placedOrderIds.length>0&&<Link href={placedOrderIds.length===1
                        ?incomingDeliveryOrderLink(snapshot.organizationId,item.property_id,placedOrderIds[0])
                        :incomingDeliveriesLink(snapshot.organizationId,item.property_id)}>Review placed order{placedOrderIds.length===1?'':'s'}</Link>}
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </>
        }
      </>:<p role="status">{operations.status==='loading'?'Checking stock and reorder levels…':'Supply records unavailable; no quantities assumed.'}</p>}
      <p className="muted small">Placed order totals count only unreceived quantities from manually recorded orders. They do not increase available stock; the projected gap is conditional on full future delivery. Existing requests are a separate record and never treated as a supplier order. Verify physical stock and actual arrivals before making a purchase; these shortcuts perform no writes.</p>
    </div>
    <div id="incoming-deliveries-handoff" className="ops-record" aria-label="Incoming supply deliveries by property">
      <h3>Incoming supply deliveries</h3>
      <p>Track purchase order lines marked ordered but not fully received, including expected-date delays. Counts are based on saved net receipts, not promises from a supplier.</p>
      {operations.status==='ready'?<>
        <div className="action-group">
          {authorized.map(property=><Link className="button secondary" key={property.id}
            href={incomingDeliveriesLink(snapshot.organizationId,property.id)}>
            {property.name}: {incomingByProperty.get(property.id)??0} outstanding lines
          </Link>)}
        </div>
        {!incoming.length?<p>No supplier purchase order lines are currently awaiting receipt in these records.</p>:
          <>
            <p role="status">Showing {Math.min(8,incoming.length)} of {incoming.length} outstanding supply lines. Late expected dates appear first.</p>
            <div className="table-wrap" role="region" aria-label="Incoming deliveries shortlist" tabIndex={0}>
              <table>
                <thead><tr><th>Property / purchase order</th><th>Supply</th><th>Still outstanding</th><th>Expected</th><th>Action</th></tr></thead>
                <tbody>{incoming.slice(0,8).map(row=>
                  <tr key={row.line.id}>
                    <th scope="row">{authorized.find(p=>p.id===row.order.property_id)?.name??'Property'}
                      <small>{row.order.number}</small></th>
                    <td>{row.line.item_snapshot.name}<small>{row.line.item_snapshot.sku}</small></td>
                    <td>{quantity(row.outstandingMilli)} {row.line.item_snapshot.unit}</td>
                    <td>{row.order.expected_on??'Not scheduled'}
                      <small>{row.eta==='overdue'?'Past expected date':row.eta==='due_today'?'Expected today':row.eta==='upcoming'?'Upcoming':'No ETA'}</small>
                    </td>
                    <td><Link href={incomingDeliveryOrderLink(snapshot.organizationId,row.order.property_id,row.order.id)}>
                      Open exact purchase order
                    </Link></td>
                  </tr>)}</tbody>
              </table>
            </div>
          </>
        }
      </>:<p role="status">{operations.status==='loading'?'Checking supplier deliveries…':'Purchase-order records unavailable; no arrivals assumed.'}</p>}
      <p className="muted small">A recorded order and an expected delivery date do not confirm shipment. Only an explicit recorded receipt updates actual stock. No orders, supplier messages or receipts are generated here.</p>
    </div>
    <p>Readings due on a schedule will be added only when verified route requirements are available.</p>
  </section>;
}

'use client';
import { cents } from '@/lib/billing-domain';
import { csv } from '@/lib/domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import { BudgetPlanningPreview } from './budget-planning-preview';

export function PurchasingExpenseSnapshot({ data, propertyId }: {
  data: OperationsSnapshot;
  propertyId: string;
}) {
  const orders = data.orders.filter((order) => order.property_id === propertyId && order.status !== 'cancelled');
  const orderIds = new Set(orders.map((order) => order.id));
  const lines = data.lines.filter((line) => line.property_id === propertyId && orderIds.has(line.purchase_order_id));
  const work = data.work.filter((item) => item.property_id === propertyId);
  const workIds = new Set(work.map((item) => item.id));
  const costs = data.costs.filter((item) => item.property_id === propertyId && workIds.has(item.work_order_id));
  const expenseTotal = costs.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + BigInt(item.amount_cents), 0n);
  const reversedTotal = costs.filter((item) => item.kind === 'reversal').reduce((sum, item) => sum + BigInt(item.amount_cents), 0n);
  const purchaseCommitments = lines.reduce((sum, line) => sum + BigInt(line.total_cost_cents), 0n);
  const months = Array.from(new Set(costs.filter((c) => ['expense', 'reversal'].includes(c.kind))
    .map((c) => c.created_at.slice(0, 7)).filter((date) => /^\\d{4}-\\d{2}$/.test(date)))).sort().reverse();
  const trends = months.map((month) => {
    const monthCosts = costs.filter((c) => c.created_at.startsWith(month));
    return {
      month,
      expenses: monthCosts.filter((c) => c.kind === 'expense').reduce((sum, c) => sum + BigInt(c.amount_cents), 0n),
      reversals: monthCosts.filter((c) => c.kind === 'reversal').reduce((sum, c) => sum + BigInt(c.amount_cents), 0n),
    };
  });
  function downloadCosts() {
    const header = ['Recorded UTC month', 'Work order', 'Category', 'Kind', 'Amount cents', 'Description', 'Reference'];
    const rows = costs.filter((c) => ['expense', 'reversal'].includes(c.kind)).map((c) => [
      c.created_at.slice(0, 7),
      work.find((w) => w.id === c.work_order_id)?.number ?? '',
      work.find((w) => w.id === c.work_order_id)?.category ?? '',
      c.kind, c.amount_cents, c.description, c.reference,
    ]);
    const output = csv([header, ...rows]);
    const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forgeos-maintenance-costs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  const format = (amount: bigint) => cents(amount);
  return (
    <section className="panel" aria-label="Purchasing and maintenance cost snapshot">
      <div className="panel-heading">
        <div>
          <h2>Purchasing &amp; maintenance cost snapshot</h2>
          <p>Recorded amounts for this property only. Order line values are commitments, not proof of payment.</p>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-card"><span>Non-cancelled orders</span><strong>{orders.length}</strong></div>
        <div className="stat-card"><span>Purchase order line totals</span><strong>{format(purchaseCommitments)}</strong><span>Not necessarily paid</span></div>
        <div className="stat-card"><span>Recorded maintenance expenses</span><strong>{format(expenseTotal)}</strong><span>Before reversals</span></div>
        <div className="stat-card"><span>Recorded expense reversals</span><strong>{format(reversedTotal)}</strong><span>Shown separately to avoid double counting</span></div>
      </div>
      <BudgetPlanningPreview data={data} propertyId={propertyId} />
      <details className="ops-record">
        <summary>Recorded monthly maintenance expenses ({trends.length} months)</summary>
        <p>Grouped by record creation month in UTC, not a paid-date ledger. Reversals are listed separately.</p>
        {trends.length ? <div className="table-wrap" role="region" aria-label="Monthly maintenance expenses" tabIndex={0}>
          <table>
            <thead><tr><th>Month</th><th>Recorded expenses</th><th>Recorded reversals</th></tr></thead>
            <tbody>{trends.map((row) => <tr key={row.month}>
              <th scope="row">{row.month}</th><td>{format(row.expenses)}</td><td>{format(row.reversals)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p>No dated maintenance expense records.</p>}
        <button type="button" className="button secondary" onClick={downloadCosts}>Download maintenance cost CSV</button>
      </details>
      <details className="ops-record">
        <summary>Purchase order history ({orders.length})</summary>
        {orders.length ? <div className="table-wrap" role="region" aria-label="Purchase order amount history" tabIndex={0}>
          <table>
            <thead><tr><th>Order</th><th>Supplier</th><th>Status</th><th>Recorded order-line total</th></tr></thead>
            <tbody>{orders.map((order) => <tr key={order.id}>
              <th scope="row">{order.number}</th>
              <td>{order.supplier_snapshot.name}</td>
              <td>{order.status.replaceAll('_', ' ')}</td>
              <td>{format(lines.filter((line) => line.purchase_order_id === order.id)
                .reduce((sum, line) => sum + BigInt(line.total_cost_cents), 0n))}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p>No non-cancelled purchase orders recorded.</p>}
      </details>
      <p>Purchase orders, inventory movements and maintenance expenses can describe related activity. Their totals are intentionally not added together. This is not a cash-spending or accounts-payable report.</p>
    </section>
  );
}

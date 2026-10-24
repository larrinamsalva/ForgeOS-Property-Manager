'use client';
import { cents } from '@/lib/billing-domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';

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

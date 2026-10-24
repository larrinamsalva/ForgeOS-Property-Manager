'use client';
import { useState } from 'react';
import { cents } from '@/lib/billing-domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';

export function BudgetPlanningPreview({ data, propertyId }: {data: OperationsSnapshot; propertyId: string}) {
  const [limit, setLimit] = useState('');
  const [category, setCategory] = useState('all');
  const month = new Date().toISOString().slice(0, 7);
  const work = data.work.filter((w) => w.property_id === propertyId);
  const workById = new Map(work.map((w) => [w.id, w]));
  const categories = [...new Set(work.map((w) => w.category).filter(Boolean))].sort();
  const costs = data.costs.filter((c) =>
    c.property_id === propertyId && workById.has(c.work_order_id) &&
    c.created_at.startsWith(month) &&
    (category === 'all' || workById.get(c.work_order_id)?.category === category));
  const expenses = costs.filter((c) => c.kind === 'expense').reduce((sum, c) => sum + BigInt(c.amount_cents), 0n);
  // Reversals are negative in some ledgers and positive in others; show them separately until verified.
  const reversals = costs.filter((c) => c.kind === 'reversal').reduce((sum, c) => sum + BigInt(c.amount_cents), 0n);
  const valid = /^(?:0|[1-9]\\d{0,8})(?:\\.\\d{1,2})?$/.test(limit) && Number(limit) > 0;
  const budgetCents = valid ? BigInt(limit.split('.')[0]) * 100n + BigInt((limit.split('.')[1] ?? '').padEnd(2,'0')) : 0n;
  const percent = budgetCents > 0n ? Number(expenses * 10000n / budgetCents) / 100 : 0;
  const severity = percent >= 100 ? 'Limit reached' : percent >= 90 ? '90% warning' : percent >= 75 ? '75% warning' : 'Under 75%';
  return <section className="panel" aria-label="Monthly budget planning preview">
    <h2>Monthly budget planning preview</h2>
    <p>This calculator is read-only and temporary. It does not save a budget, notify staff, or affect bills. Only recorded maintenance expenses count toward the preview; purchase orders are excluded.</p>
    <div className="meter-controls">
      <label>Expense category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All maintenance categories</option>
          {categories.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      <label>Proposed monthly limit (USD)
        <input type="text" inputMode="decimal" value={limit} maxLength={12}
          onChange={(event) => setLimit(event.target.value)} placeholder="Example: 1500.00" />
      </label>
    </div>
    <p>Recorded UTC month: <strong>{month}</strong>. Expense records: <strong>{cents(expenses)}</strong>. Reversal entries shown separately: <strong>{cents(reversals)}</strong>.</p>
    {valid ? <>
      <p role="status"><strong>{severity}</strong> — {percent.toFixed(1)}% of proposed {cents(budgetCents)} limit (gross expense entries before reversals).</p>
      <progress max={100} value={Math.min(100, percent)} aria-label="Proposed budget used" style={{width:'100%'}} />
    </> : <p>Enter a positive proposed monthly budget to compare against recorded expenses.</p>}
    <p>Saved, manager-controlled budgets and permanent alerts require a separate server-backed policy and authorization work.</p>
  </section>;
}

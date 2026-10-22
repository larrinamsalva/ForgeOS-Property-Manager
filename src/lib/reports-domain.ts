export const reportKinds = [
  'daily_operations',
  'occupancy',
  'reservations',
  'tenant_history',
  'rent_roll',
  'monthly_billing',
  'utility_usage',
  'meter_exceptions',
  'aging',
  'payment_history',
  'maintenance',
  'inventory',
  'employee_completion',
  'revenue_trends',
  'property_comparison',
] as const;
export type ReportKind = (typeof reportKinds)[number];
export interface ReportColumn {
  label: string;
  kind?: 'money' | 'milli' | 'percent';
}
export interface ReportDefinition {
  label: string;
  description: string;
  columns: ReportColumn[];
}
const cols = (...labels: string[]): ReportColumn[] => labels.map((label) => ({ label }));
const money = (label: string): ReportColumn => ({ label, kind: 'money' });
export const reportDefinitions: Record<ReportKind, ReportDefinition> = {
  daily_operations: {
    label: 'Daily operations',
    description: 'Current property-local business dates; due work and checklists include overdue records.',
    columns: cols(
      'Property',
      'Business date',
      'Arrivals today',
      'Planned departures today',
      'Pending work',
      'Open due checklists',
      'Uncaptured due meter stops',
      'Low-stock items'
    ),
  },
  occupancy: {
    label: 'Site occupancy',
    description: 'Current actual occupants and confirmed reservations. Overdue actual stays remain occupied.',
    columns: cols(
      'Property',
      'Site / unit',
      'Type',
      'Section',
      'Current state',
      'Customer',
      'Actual arrival',
      'Planned departure',
      'Physical availability'
    ),
  },
  reservations: {
    label: 'Reservations',
    description: 'Reservations overlapping the range. Arrival is inclusive; departure is exclusive.',
    columns: [
      ...cols(
        'Property',
        'Confirmation',
        'Site / unit',
        'Customer',
        'Arrival',
        'Departure',
        'Status',
        'Rate period'
      ),
      money('Agreed rate'),
    ],
  },
  tenant_history: {
    label: 'Tenant history',
    description:
      'Actual stays overlapping the range, including retained departures and historical stay agreements.',
    columns: [
      ...cols(
        'Property',
        'Customer',
        'Site / unit',
        'Actual arrival',
        'Actual departure',
        'Planned departure',
        'Rate period'
      ),
      money('Agreed rate'),
      ...cols('State'),
    ],
  },
  rent_roll: {
    label: 'Current rent roll',
    description:
      'Actual occupants and current recorded lease rates, falling back to the stay agreement. Rate periods are not normalized monthly revenue.',
    columns: [
      ...cols('Property', 'Site / unit', 'Customer', 'Rate period'),
      money('Current agreed rate'),
      ...cols('Arrival', 'Planned departure', 'Lease reference'),
    ],
  },
  monthly_billing: {
    label: 'Monthly billing',
    description:
      'Invoices whose service periods overlap the range. Full invoice totals are shown, without report-window proration.',
    columns: [
      ...cols('Property', 'Invoice', 'Customer', 'Service from', 'Service to', 'Issued', 'State'),
      money('Original charges'),
      money('Charges after adjustments'),
      money('Allocated'),
      money('Outstanding'),
    ],
  },
  utility_usage: {
    label: 'Billed utility usage',
    description:
      'Source-backed utility lines on issued approved invoices overlapping the range; this is billed usage, not unbilled estimated consumption.',
    columns: [
      ...cols(
        'Property',
        'Invoice',
        'Customer',
        'Site / unit',
        'Utility',
        'Service from',
        'Service to',
        'Quantity',
        'Unit'
      ),
      money('Line charge'),
    ],
  },
  meter_exceptions: {
    label: 'Meter reading exceptions',
    description:
      'Flagged, estimated, exceptional or not-yet-accepted observations captured in the selected property dates. Original values and latest corrections remain separate.',
    columns: cols(
      'Property',
      'Meter',
      'Site / unit',
      'Captured',
      'Original value',
      'Latest correction',
      'Kind',
      'Flag',
      'Review',
      'Exceptions'
    ),
  },
  aging: {
    label: 'Current aging',
    description:
      'Current issued unpaid balances, due-date aging and separately configured grace period. This is not a historical accounting balance.',
    columns: [
      ...cols('Property', 'Invoice', 'Customer', 'Due', 'Grace through', 'Days past due', 'Aging bucket'),
      money('Outstanding'),
    ],
  },
  payment_history: {
    label: 'Payment and deposit cash history',
    description:
      'Recorded cash by transaction date, including refunds and voids. Deposit cash remains separate; reconciled cash remains included.',
    columns: [
      ...cols('Property', 'Customer', 'Transaction date', 'Source', 'Event', 'Method'),
      money('Signed recorded cash'),
      ...cols('Reference'),
    ],
  },
  maintenance: {
    label: 'Maintenance',
    description:
      'Work requested in the range, current lifecycle, recorded time and net operational costs. These costs do not bill residents.',
    columns: [
      ...cols(
        'Property',
        'Work order',
        'Title',
        'Site / unit',
        'Employee',
        'Requested',
        'Due',
        'State',
        'Category',
        'Minutes'
      ),
      money('Actual operational cost'),
    ],
  },
  inventory: {
    label: 'Current inventory',
    description:
      'Current signed movement balances and standard reference cost, without FIFO or accounting valuation.',
    columns: [
      ...cols('Property', 'SKU', 'Item', 'Category', 'Location'),
      { label: 'Quantity', kind: 'milli' },
      ...cols('Unit'),
      money('Standard unit cost'),
      { label: 'Reorder threshold', kind: 'milli' },
      ...cols('Last purchase', 'State'),
    ],
  },
  employee_completion: {
    label: 'Employee completion',
    description:
      'Current completed/closed work, checklist closures and time performed in the selected dates. Operational activity, not payroll.',
    columns: cols(
      'Property',
      'Employee',
      'Employment status',
      'Completed / closed work',
      'Approved work',
      'Closed checklists',
      'Minutes recorded'
    ),
  },
  revenue_trends: {
    label: 'Monthly billing and cash trends',
    description:
      'Current adjusted issued charges attributed to original issuance month and recorded payment cash, with deposits separate. Not general-ledger recognized revenue.',
    columns: [
      ...cols('Property', 'Month'),
      money('Issued charges after adjustments'),
      money('Net payment cash'),
      money('Net deposit cash'),
    ],
  },
  property_comparison: {
    label: 'Multi-property comparison',
    description:
      'Current occupancy and operational state for authorized properties. Dashboard cash uses the selected range.',
    columns: [
      ...cols('Property', 'Business date', 'Sites', 'Occupied', 'Available', 'Reserved'),
      { label: 'Occupancy %', kind: 'percent' },
      ...cols('Pending work', 'Invoice drafts', 'Past-due customer accounts', 'Low-stock items'),
    ],
  },
};
export interface ReportFilters {
  property_id: string | null;
  site_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  category: string;
}
export interface ReportRow {
  id: string;
  property_id: string;
  site_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  day: string;
  status: string;
  category: string;
  values: (string | number | null)[];
}
export interface ReportResult {
  rows: ReportRow[];
  total: string;
  page: number;
  page_size: number;
  generated_at: string;
}
export interface PropertyMetrics {
  property_id: string;
  name: string;
  timezone: string;
  as_of: string;
  archived: boolean;
  operating_status: string;
  sites: string;
  occupied: string;
  available: string;
  reserved: string;
  occupancy_percent: string | null;
  arrivals: string;
  departures: string;
  new_customers: string;
  pending_work: string;
  open_checklists: string;
  outstanding_readings: string;
  invoice_drafts: string;
  payment_cash_cents: string;
  deposit_cash_cents: string;
  past_due_accounts: string;
  low_stock: string;
}
export interface ReportsSummary {
  starts_on: string;
  ends_on: string;
  generated_at: string;
  properties: PropertyMetrics[];
  employees: { user_id: string; property_id: string; name: string }[];
}
export function sumMetrics(rows: PropertyMetrics[], key: keyof PropertyMetrics): string {
  return rows.reduce((sum, row) => sum + BigInt(String(row[key] ?? '0')), 0n).toString();
}
export function occupancyPercent(occupied: string, sites: string): string | null {
  if (BigInt(sites) === 0n) return null;
  const scaled = (BigInt(occupied) * 10000n + BigInt(sites) / 2n) / BigInt(sites);
  return String(scaled / 100n) + '.' + String(scaled % 100n).padStart(2, '0');
}
export function milli(value: string): string {
  const n = BigInt(value),
    a = n < 0n ? -n : n;
  return (n < 0n ? '-' : '') + String(a / 1000n) + '.' + String(a % 1000n).padStart(3, '0');
}

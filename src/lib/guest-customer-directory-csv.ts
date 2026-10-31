import type { DemoCustomer, DemoSite } from '../components/guest-record-editors';

type CsvCustomer = Pick<DemoCustomer, 'name' | 'siteId' | 'pets' | 'guestVisits'>;
type CsvSite = Pick<DemoSite, 'id' | 'rent'>;

const csvCell = (value: string | number) => {
  let text = String(value);
  // User-entered names/spaces must never become spreadsheet formulas.
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};

const extendedVisitCount = (customer: CsvCustomer) => (customer.guestVisits ?? []).filter((visit) =>
  (Date.parse(visit.departure + 'T00:00:00Z') - Date.parse(visit.arrival + 'T00:00:00Z')) / 86400000 > 14
).length;

export function createGuestCustomerDirectoryCsv(customers: readonly CsvCustomer[], sites: readonly CsvSite[]) {
  const rentBySite = new Map(sites.map((site) => [site.id, site.rent]));
  const rows: (string | number)[][] = [
    ['Customer name', 'Space', 'Monthly rent (USD)', 'Dogs', 'Cats', 'Horses', 'Cows', 'Recorded visitors', 'Extended visits (over 14 days)'],
    ...customers.map((customer) => [
      customer.name,
      customer.siteId || 'Not assigned',
      customer.siteId ? (rentBySite.get(customer.siteId) ?? '') : '',
      customer.pets?.dogs ?? 0,
      customer.pets?.cats ?? 0,
      customer.pets?.horses ?? 0,
      customer.pets?.cows ?? 0,
      customer.guestVisits?.length ?? 0,
      extendedVisitCount(customer),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

import type { DemoCustomer } from '../components/guest-record-editors';

type VisitorCustomer = Pick<DemoCustomer, 'id' | 'name' | 'siteId' | 'guestVisits'>;

export function extendedVisitCount(customer: VisitorCustomer): number {
  return (customer.guestVisits ?? []).filter((visit) => {
    const arrival = Date.parse(visit.arrival + 'T00:00:00Z');
    const departure = Date.parse(visit.departure + 'T00:00:00Z');
    return Number.isFinite(arrival) && Number.isFinite(departure) &&
      (departure - arrival) / 86400000 > 14;
  }).length;
}

// A review list is NOT a determination that visitors are currently on site,
// a formal approval queue, or a violation of an individual property's rules.
export function guestExtendedVisitReviewList(customers: readonly VisitorCustomer[]) {
  return customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      siteId: customer.siteId,
      extendedVisits: extendedVisitCount(customer),
    }))
    .filter((record) => record.extendedVisits > 0)
    .sort((a, b) =>
      b.extendedVisits - a.extendedVisits ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.id - b.id
    );
}

export const GUEST_VISITOR_REVIEW_PAGE_SIZE = 10;

export function paginateGuestVisitorReview<T>(
  records: readonly T[],
  requestedPage: number,
) {
  const pages = Math.max(1, Math.ceil(records.length / GUEST_VISITOR_REVIEW_PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(requestedPage, pages - 1))
    : 0;
  return {
    page,
    pages,
    rows: records.slice(page * GUEST_VISITOR_REVIEW_PAGE_SIZE, (page + 1) * GUEST_VISITOR_REVIEW_PAGE_SIZE),
  };
}

/** Search only customer names and space IDs, never private visitor identities. */
export function searchGuestExtendedVisitorReviews<T extends { name: string; siteId: string | null }>(
  records: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...records];
  return records.filter((record) =>
    (record.name + ' ' + (record.siteId ?? '')).toLocaleLowerCase().includes(normalized)
  );
}

/**
 * Classify recorded extended-visit date windows in the property's calendar.
 * These are expected date ranges, never proof of arrival, presence, or approval.
 */
export function extendedVisitorDateWindows(customer: VisitorCustomer, today: string) {
  const counts = { upcoming: 0, within: 0, ended: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return counts;
  const todayMs = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(todayMs)) return counts;
  for (const visit of customer.guestVisits ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.arrival) || !/^\d{4}-\d{2}-\d{2}$/.test(visit.departure)) continue;
    const start = Date.parse(visit.arrival + 'T00:00:00Z');
    const end = Date.parse(visit.departure + 'T00:00:00Z');
    if (!Number.isFinite(start) || !Number.isFinite(end) || (end - start) / 86400000 <= 14) continue;
    if (todayMs < start) counts.upcoming++;
    else if (todayMs > end) counts.ended++;
    else counts.within++;
  }
  return counts;
}

export function guestExtendedVisitReviewWithWindows(customers: readonly VisitorCustomer[], today: string) {
  const source = new Map(customers.map((customer) => [customer.id, customer]));
  return guestExtendedVisitReviewList(customers).map((record) => ({
    ...record,
    dateWindows: extendedVisitorDateWindows(source.get(record.id)!, today),
  }));
}

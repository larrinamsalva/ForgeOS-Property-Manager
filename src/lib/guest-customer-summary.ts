import type { DemoCustomer } from '../components/guest-record-editors';

type SummaryCustomer = Pick<DemoCustomer, 'pets' | 'guestVisits'>;

export function summarizeGuestCustomers(customers: readonly SummaryCustomer[]) {
  const totals = {
    customers: customers.length,
    customersWithAnimals: 0,
    dogs: 0,
    cats: 0,
    horses: 0,
    cows: 0,
    customersWithExtendedVisits: 0,
    extendedVisitorRecords: 0,
  };
  for (const customer of customers) {
    const dogs = customer.pets?.dogs ?? 0;
    const cats = customer.pets?.cats ?? 0;
    const horses = customer.pets?.horses ?? 0;
    const cows = customer.pets?.cows ?? 0;
    totals.dogs += dogs;
    totals.cats += cats;
    totals.horses += horses;
    totals.cows += cows;
    if (dogs + cats + horses + cows > 0) totals.customersWithAnimals++;

    const extended = (customer.guestVisits ?? []).filter((visit) => {
      const arrival = Date.parse(visit.arrival + 'T00:00:00Z');
      const departure = Date.parse(visit.departure + 'T00:00:00Z');
      return Number.isFinite(arrival) && Number.isFinite(departure) &&
        (departure - arrival) / 86400000 > 14;
    }).length;
    totals.extendedVisitorRecords += extended;
    if (extended > 0) totals.customersWithExtendedVisits++;
  }
  return totals;
}

import { describe, it, expect } from 'vitest';
import {
  addDays,
  calendarMonth,
  planningDeparture,
  rangesOverlap,
  siteStatus,
  type Stay,
  type Site,
  type Reservation,
} from '../../src/lib/domain';
import { reservationSchema, staySchema } from '../../src/lib/validation';
describe('Booking dates, availability boundaries and exact amounts', () => {
  it('advances civil dates across DST, leap days and variable-length calendar months', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(calendarMonth('2026-03-31', -1)).toBe('2026-02-01');
    expect(calendarMonth('2026-12-01', 1)).toBe('2027-01-01');
  });
  it('treats departures as exclusive and keeps overdue occupants blocked until actual move-out', () => {
    expect(rangesOverlap('2026-10-21', '2026-10-23', '2026-10-23', '2026-10-25')).toBe(false);
    expect(rangesOverlap('2026-10-21', null, '2026-11-01', '2026-11-03')).toBe(true);
    const stay = { ends_on: null, planned_ends_on: '2026-10-21' } as Stay;
    expect(planningDeparture(stay, '2026-10-21')).toBeNull();
    expect(planningDeparture(stay, '2026-10-20')).toBe('2026-10-21');
  });
  it('distinguishes a current confirmed reservation from occupancy and nonblocking inquiry', () => {
    const site = { id: 'site', archived_at: null, physical_status: 'ready' } as Site;
    const reservation = {
      site_id: 'site',
      starts_on: '2026-10-21',
      ends_on: '2026-10-23',
      status: 'confirmed',
    } as Reservation;
    expect(siteStatus(site, [], '2026-10-21', [reservation])).toBe('reserved');
    expect(siteStatus({ ...site, physical_status: 'in_preparation' }, [], '2026-10-21', [reservation])).toBe(
      'in_preparation'
    );
    expect(siteStatus(site, [], '2026-10-23', [reservation])).toBe('available');
    expect(siteStatus(site, [], '2026-10-21', [{ ...reservation, status: 'inquiry' }])).toBe('available');
    const active = { site_id: 'site', starts_on: '2026-10-20', ends_on: null } as Stay;
    expect(siteStatus(site, [active], '2026-10-21', [reservation])).toBe('occupied');
  });
  it('rejects reversed dates and excess deposit notes, preserves money and legacy move-in defaults', () => {
    const property_id = '20000000-0000-4000-8000-000000000001',
      site_id = '20000000-0000-4000-8000-000000000002',
      customer_id = '20000000-0000-4000-8000-000000000003';
    const input = {
      property_id,
      site_id,
      customer_id,
      starts_on: '2026-10-21',
      ends_on: '2026-10-22',
      status: 'confirmed',
      billing_period: 'nightly',
      agreed_rate: '45.29',
      deposit_required: '100.00',
      deposit_recorded: '25.00',
      deposit_reference: '',
      guest_count: '2',
      rv_length_ft: '',
      vehicle_details: '',
      pet_notes: '',
      notes: '',
    };
    expect(reservationSchema.parse(input).agreed_rate_cents).toBe(4529);
    expect(reservationSchema.safeParse({ ...input, ends_on: input.starts_on }).success).toBe(false);
    expect(reservationSchema.safeParse({ ...input, deposit_recorded: '101.00' }).success).toBe(false);
    const stay = staySchema.parse({
      property_id,
      site_id,
      customer_id,
      starts_on: input.starts_on,
      agreed_rate: '650.10',
      notes: '',
    });
    expect(stay.planned_ends_on).toBeNull();
    expect(stay.deposit_required_cents).toBe(0);
    expect(stay.billing_period).toBe('monthly');
  });
});

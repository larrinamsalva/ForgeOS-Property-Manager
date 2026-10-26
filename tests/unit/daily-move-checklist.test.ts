import {describe,expect,it} from 'vitest';
import {dailyMoveChecklist} from '../../src/lib/daily-move-checklist';
const reservations=[
 {property_id:'park',status:'confirmed',starts_on:'2026-10-25'},
 {property_id:'park',status:'cancelled',starts_on:'2026-10-25'},
 {property_id:'other',status:'confirmed',starts_on:'2026-10-25'},
 {property_id:'park',status:'confirmed',starts_on:'2026-10-26'},
] as const;
const stays=[
 {property_id:'park',starts_on:'2026-10-25',ends_on:null,planned_ends_on:null},
 {property_id:'park',starts_on:'2026-09-01',ends_on:null,planned_ends_on:'2026-10-25'},
 {property_id:'park',starts_on:'2026-09-01',ends_on:'2026-10-25',planned_ends_on:'2026-10-25'},
 {property_id:'other',starts_on:'2026-10-25',ends_on:null,planned_ends_on:'2026-10-25'},
];
describe('local-day daily manager move worklist',()=>{
 it('counts authorized property arrivals and distinguishes planned from completed departures',()=>{
  expect(dailyMoveChecklist('park','2026-10-25',reservations,stays))
   .toEqual({confirmedArrivals:1,moveIns:1,plannedDepartures:2,completedMoveOuts:1});
 });
 it('does not include cancelled arrivals or another property',()=>{
  expect(dailyMoveChecklist('other','2026-10-25',reservations,stays))
   .toEqual({confirmedArrivals:1,moveIns:1,plannedDepartures:1,completedMoveOuts:0});
 });
});

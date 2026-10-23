import { describe, expect, it } from 'vitest';
import { formatMaintenanceDescription, getSavedMaintenanceDescription, maintenanceCategories, maintenanceAreas } from '../../src/lib/maintenance-catalog';
import { maintenanceSelfTaskSchema } from '../../src/lib/maintenance-validation';
describe('maintenance work areas and task permissions', () => {
 it('includes requested common area and service types', () => {
  for (const x of ['Plumbing','Tree trimming','Sprinklers & irrigation','Bathrooms & restrooms','Laundry room equipment','Trash cans & dumpster']) {
   expect(maintenanceCategories).toContain(x);
  }
  for (const x of ['bathrooms','laundry','trash','sprinklers','trees']) {
   expect(maintenanceAreas.map(y => y.value)).toContain(x);
  }
 });
 it('retains area and exact location within the existing work description field', () => {
  const original = formatMaintenanceDescription('laundry', 'Building B', 'Dryer not heating');
  expect(original).toMatch(/Laundry room · Building B/);
  expect(getSavedMaintenanceDescription(original)).toEqual({
   area:'laundry',detail:'Building B',description:'Dryer not heating'
  });
 });
 it('requires a scoped, self-contained request without customer or arbitrary assignee', () => {
  const payload = {
   organization_id: crypto.randomUUID(),property_id:crypto.randomUUID(),request_id:crypto.randomUUID(),
   reason:'Technician opened task', title:'Repair irrigation head',
   description:'Service area: Sprinklers / irrigation zones\n\nReplace broken sprinkler head',
   category:'Sprinklers & irrigation',priority:'normal',work_area:'sprinklers',
   site_id:null,requested_on:'2026-10-22',due_on:null,parts_required:'PVC connector'
  };
  expect(maintenanceSelfTaskSchema.safeParse({command:'maintenance_self_task',payload}).success).toBe(true);
  expect(maintenanceSelfTaskSchema.safeParse({command:'maintenance_self_task',payload:{...payload,customer_id:crypto.randomUUID()}}).success).toBe(false);
  expect(maintenanceSelfTaskSchema.safeParse({command:'maintenance_self_task',payload:{...payload,assigned_to:crypto.randomUUID()}}).success).toBe(false);
 });
});

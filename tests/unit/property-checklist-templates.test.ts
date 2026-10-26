import { describe,expect,it } from 'vitest';
import { propertyChecklistTemplates,propertyChecklistTemplate } from '../../src/lib/property-checklist-templates';
describe('property service checklist templates',()=>{
 it('contains six usable templates with unique ids and safe-size checklist items',()=>{
  expect(propertyChecklistTemplates).toHaveLength(6);
  expect(new Set(propertyChecklistTemplates.map(t=>t.id)).size).toBe(6);
  for(const t of propertyChecklistTemplates){
   expect(t.items.length).toBeGreaterThan(0);
   expect(t.items.length).toBeLessThanOrEqual(50);
   expect(t.items.every(item=>item.length>0 && item.length<=200)).toBe(true);
   expect(propertyChecklistTemplate(t.id)).toEqual(t);
  }
 });
 it('returns undefined for an unknown template',()=>{
  expect(propertyChecklistTemplate('missing')).toBeUndefined();
 });
});
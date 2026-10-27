import {describe,it,expect} from 'vitest';
import {
  maintenanceFormSiteDefault,siteMaintenanceCreateLink,siteMaintenanceLink,
} from '../../src/lib/site-maintenance-focus';
import {meterSiteFromQuery} from '../../src/lib/meter-actions';
const sites=[
 {id:'site-88',property_id:'park-a',archived_at:null,label:'Space 88'},
 {id:'site-99',property_id:'park-b',archived_at:null,label:'Space 99'},
 {id:'duplicate-a',property_id:'park-a',archived_at:null,label:'Space 5'},
 {id:'duplicate-b',property_id:'park-a',archived_at:null,label:'Space 5'},
 {id:'archived-site',property_id:'park-a',archived_at:'2026-01-01T00:00:00Z',label:'Retired space'},
];
describe('maintenance form site prefill',()=>{
 it('prefills the exact active physical site ID, without relying on its label or tenant',()=>{
  expect(maintenanceFormSiteDefault(sites,'park-a','site-88')).toBe('site-88');
  expect(maintenanceFormSiteDefault(sites,'park-a','duplicate-a')).toBe('duplicate-a');
  expect(maintenanceFormSiteDefault(sites,'park-a','duplicate-b')).toBe('duplicate-b');
 });
 it('rejects archived sites, another property, unknown IDs, and absent selections',()=>{
  for(const requested of ['archived-site','site-99','missing','']){
   expect(maintenanceFormSiteDefault(sites,'park-a',requested)).toBe('');
  }
  expect(maintenanceFormSiteDefault(sites,'park-a',undefined)).toBe('');
  expect(maintenanceFormSiteDefault(sites,'','site-88')).toBe('');
 });
 it('only adds an explicit create request when the operator follows the site profile shortcut',()=>{
  const plain=new URL(siteMaintenanceLink('org','park-a','site-88'),'https://example.test');
  expect(plain.searchParams.has('create')).toBe(false);
  const create=new URL(siteMaintenanceCreateLink('org','park-a','site-88'),'https://example.test');
  expect(create.pathname).toBe('/maintenance');
  expect(create.searchParams.get('site')).toBe('site-88');
  expect(create.searchParams.get('create')).toBe('repair');
  expect(create.searchParams.has('work')).toBe(false);
 });
 it('encodes untrusted URL fields and leaves resident, billing, and contact data out',()=>{
  const url=new URL(siteMaintenanceCreateLink('org & more','park?role=admin','site 88&work=someone-else'),'https://example.test');
  expect(url.searchParams.get('organization')).toBe('org & more');
  expect(url.searchParams.get('property')).toBe('park?role=admin');
  expect(url.searchParams.get('site')).toBe('site 88&work=someone-else');
  expect(url.searchParams.get('create')).toBe('repair');
  expect(url.searchParams.has('work')).toBe(false);
  expect(url.searchParams.getAll('create')).toEqual(['repair']);
  for(const key of ['tenant','customer','phone','stay','invoice','payment','amount','resident']){
   expect(url.searchParams.has(key)).toBe(false);
  }
 });
 it('does not authorize a requested site solely because its ID appears in the URL',()=>{
  const url=new URL(siteMaintenanceCreateLink('org','park-a','site-99'),'https://example.test');
  expect(meterSiteFromQuery(url.searchParams.get('site')??undefined,'park-a',sites)).toBeUndefined();
  expect(maintenanceFormSiteDefault(sites,'park-a','site-99')).toBe('');
 });
 it('does not mutate the underlying site registry',()=>{
  const before=sites.map(s=>({...s}));
  maintenanceFormSiteDefault(sites,'park-a','site-88');
  expect(sites).toEqual(before);
 });
});

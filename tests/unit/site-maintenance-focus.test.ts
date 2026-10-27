import {describe,it,expect} from 'vitest';
import {filterWorkOrdersBySite,siteMaintenanceLink} from '../../src/lib/site-maintenance-focus';
import {meterSiteFromQuery} from '../../src/lib/meter-actions';
import type {WorkOrder} from '../../src/lib/operations-domain';

const jobs=[
 {id:'plumbing-88',site_id:'site-88',status:'new',priority:'urgent'},
 {id:'sprinkler-88',site_id:'site-88',status:'completed',priority:'normal'},
 {id:'laundry-88',site_id:'site-88',status:'waiting_parts',priority:'high'},
 {id:'tree-99',site_id:'site-99',status:'in_progress',priority:'high'},
 {id:'common-area',site_id:null,status:'new',priority:'low'},
] as WorkOrder[];

describe('maintenance site focus from site profiles',()=>{
 it('includes all statuses and history at the exact physical site',()=>{
  expect(filterWorkOrdersBySite(jobs,'site-88').map(j=>j.id))
   .toEqual(['plumbing-88','sprinkler-88','laundry-88']);
  expect(filterWorkOrdersBySite(jobs,'site-99').map(j=>j.id))
   .toEqual(['tree-99']);
  expect(filterWorkOrdersBySite(jobs,'missing')).toEqual([]);
 });
 it('keeps common-area and other-site repairs out of site-specific queues',()=>{
  const site=filterWorkOrdersBySite(jobs,'site-88');
  expect(site.some(j=>j.site_id===null)).toBe(false);
  expect(site.some(j=>j.site_id==='site-99')).toBe(false);
 });
 it('clears to all work orders while preserving the original list and order',()=>{
  const all=filterWorkOrdersBySite(jobs,'');
  expect(all).toEqual(jobs);
  expect(all).not.toBe(jobs);
  expect(jobs).toHaveLength(5);
 });
 it('generates URL-encoded physical site IDs without tenant or contact data',()=>{
  const target=siteMaintenanceLink('org & one','park 3','space 88&role=admin');
  const url=new URL(target,'https://example.test');
  expect(url.pathname).toBe('/maintenance');
  expect(url.searchParams.get('organization')).toBe('org & one');
  expect(url.searchParams.get('property')).toBe('park 3');
  expect(url.searchParams.get('site')).toBe('space 88&role=admin');
  expect(url.searchParams.getAll('site')).toHaveLength(1);
  for(const key of ['customer','stay','resident','phone','invoice','amount','payment','notes'])
   expect(url.searchParams.has(key)).toBe(false);
 });
 it('server-side site authorization rejects cross-property or unknown IDs',()=>{
  const sites=[{id:'site-88',property_id:'park-one'},{id:'site-99',property_id:'park-two'}];
  expect(meterSiteFromQuery('site-88','park-one',sites)).toBe('site-88');
  expect(meterSiteFromQuery('site-99','park-one',sites)).toBeUndefined();
  expect(meterSiteFromQuery('unknown','park-one',sites)).toBeUndefined();
 });
 it('keeps duplicate displayed site labels distinct by their IDs',()=>{
  const listed=[{id:'a',site_id:'site-a',label:'Space 88'},
   {id:'b',site_id:'site-b',label:'Space 88'}];
  expect(filterWorkOrdersBySite(listed,'site-a').map(j=>j.id)).toEqual(['a']);
 });
});

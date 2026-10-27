import {describe,it,expect} from 'vitest';
import {siteMeterReviewLinks} from '../../src/lib/site-meter-links';
import {meterSiteFromQuery,meterUtilityFromQuery,meterViewFromQuery} from '../../src/lib/meter-actions';

const parse=(href:string)=>new URL(href,'https://forgeos.example');

describe('site profile meter navigation',()=>{
 it('opens the full reading history for the exact site instead of the property-wide meter directory',()=>{
  const links=siteMeterReviewLinks('org & 1','park 3','space 88');
  const url=parse(links.history);
  expect(url.pathname).toBe('/meters');
  expect(url.searchParams.get('organization')).toBe('org & 1');
  expect(url.searchParams.get('property')).toBe('park 3');
  expect(url.searchParams.get('site')).toBe('space 88');
  expect(meterViewFromQuery(url.searchParams.get('view')??undefined)).toBe('history');
  expect(url.searchParams.has('utility')).toBe(false);
 });
 it('opens the Needs attention supervisor view for the matching site',()=>{
  const links=siteMeterReviewLinks('org-1','park 3','space 88');
  const url=parse(links.review);
  expect(url.searchParams.get('site')).toBe('space 88');
  expect(url.searchParams.get('view')).toBe('review');
  expect(url.searchParams.has('utility')).toBe(false);
 });
 it('offers distinct electric water and gas review shortcuts with the same property and site',()=>{
  const links=siteMeterReviewLinks('org-1','property A','Space 88');
  for(const utility of ['electric','water','gas'] as const){
   const url=parse(links.utilities[utility]);
   expect(url.pathname).toBe('/meters');
   expect(url.searchParams.get('property')).toBe('property A');
   expect(url.searchParams.get('site')).toBe('Space 88');
   expect(url.searchParams.get('view')).toBe('review');
   expect(meterUtilityFromQuery(url.searchParams.get('utility')??undefined)).toBe(utility);
  }
  expect(links.utilities.water).not.toBe(links.utilities.electric);
 });
 it('uses URL encoding so site labels and ID-like strings cannot append fake parameters',()=>{
  const links=siteMeterReviewLinks('org?view=history','property&role=admin','site 88&utility=gas');
  const url=parse(links.utilities.water);
  expect(url.searchParams.get('organization')).toBe('org?view=history');
  expect(url.searchParams.get('property')).toBe('property&role=admin');
  expect(url.searchParams.get('site')).toBe('site 88&utility=gas');
  expect(url.searchParams.get('utility')).toBe('water');
  expect(url.searchParams.getAll('utility')).toHaveLength(1);
 });
 it('never embeds tenant, contact, private notes, or billing identifiers in site links',()=>{
  const urls=Object.values(siteMeterReviewLinks('org','property','site')).flatMap(value=>
   typeof value==='string'?[value]:Object.values(value));
  for(const href of urls){
   const url=parse(href);
   for(const key of ['customer','resident','phone','stay','invoice','amount','payment','notes'])
    expect(url.searchParams.has(key)).toBe(false);
  }
 });
 it('uses the established server-side property/site validation to reject cross-property targets',()=>{
  const site=siteMeterReviewLinks('org','park-a','site-b').review;
  const query=parse(site).searchParams;
  const authorizedSites=[{id:'site-a',property_id:'park-a'},{id:'site-b',property_id:'park-b'}];
  expect(meterSiteFromQuery(query.get('site')??undefined,'park-a',authorizedSites)).toBeUndefined();
  expect(meterSiteFromQuery('site-a','park-a',authorizedSites)).toBe('site-a');
 });
});

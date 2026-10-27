import {describe,it,expect} from 'vitest';
import {
  focusedSiteWorkOrder, siteMaintenanceWorkLink, filterWorkOrdersBySite,
} from '../../src/lib/site-maintenance-focus';
import {meterSiteFromQuery} from '../../src/lib/meter-actions';
import type {WorkOrder} from '../../src/lib/operations-domain';

const orders=[
  {id:'work-88',property_id:'property-a',site_id:'site-88',number:'R-12',status:'new'},
  {id:'work-99',property_id:'property-a',site_id:'site-99',number:'R-12',status:'completed'},
  {id:'work-other-property',property_id:'property-b',site_id:'site-88',number:'R-12',status:'new'},
  {id:'work-common',property_id:'property-a',site_id:null,number:'R-12',status:'new'},
] as WorkOrder[];

describe('site profile individual repair deep links',()=>{
  it('directs each row to its own physical site and work ID without displaying private resident details',()=>{
    const href=siteMaintenanceWorkLink('org & 1','property-a','site 88&admin=true','work-88');
    const uri=new URL(href,'https://test.invalid');
    expect(uri.pathname).toBe('/maintenance');
    expect(uri.searchParams.get('organization')).toBe('org & 1');
    expect(uri.searchParams.get('property')).toBe('property-a');
    expect(uri.searchParams.get('site')).toBe('site 88&admin=true');
    expect(uri.searchParams.get('work')).toBe('work-88');
    expect(uri.searchParams.getAll('site')).toHaveLength(1);
    for(const forbidden of ['customer','resident','phone','stay','invoice','notes','amount','staff']){
      expect(uri.searchParams.has(forbidden)).toBe(false);
    }
  });
  it('allows exact historical work order ID even if another site has the same work number',()=>{
    expect(focusedSiteWorkOrder(orders,'work-88','property-a','site-88')?.id).toBe('work-88');
    expect(focusedSiteWorkOrder(orders,'work-99','property-a','site-99')?.id).toBe('work-99');
    expect(filterWorkOrdersBySite(orders,'site-88').map(x=>x.id))
      .toEqual(['work-88','work-other-property']);
  });
  it('does not open cross-site, cross-property, absent or common-area work orders',()=>{
    for(const [id,property,site] of [
      ['work-88','property-a','site-99'],
      ['work-99','property-a','site-88'],
      ['work-other-property','property-a','site-88'],
      ['work-common','property-a','site-88'],
      ['missing','property-a','site-88'],
      ['work-88','property-b','site-88'],
      ['work-88','','site-88'],
      ['work-88','property-a',''],
    ]){
      expect(focusedSiteWorkOrder(orders,id,property,site)).toBeUndefined();
    }
  });
  it('rejects oversize or missing link work IDs before searching the authorized rows',()=>{
    expect(focusedSiteWorkOrder(orders,undefined,'property-a','site-88')).toBeUndefined();
    expect(focusedSiteWorkOrder(orders,'x'.repeat(129),'property-a','site-88')).toBeUndefined();
  });
  it('requires authorization of the site before using the work link',()=>{
    const sites=[
      {id:'site-88',property_id:'property-a'},
      {id:'site-99',property_id:'property-b'},
    ];
    const uri=new URL(siteMaintenanceWorkLink('org','property-a','site-99','work-99'),'https://test.invalid');
    const validatedSite=meterSiteFromQuery(uri.searchParams.get('site')??undefined,'property-a',sites);
    expect(validatedSite).toBeUndefined();
    expect(focusedSiteWorkOrder(orders,uri.searchParams.get('work')??undefined,'property-a',validatedSite??''))
      .toBeUndefined();
  });
});

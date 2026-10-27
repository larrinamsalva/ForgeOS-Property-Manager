import type {WorkOrder} from './operations-domain';

/** Scope a maintenance worklist to one physical site, not the current resident
 * or a site label that could be reused. Property scoping is done by the caller
 * before this helper is applied; authorization remains server-enforced. */
export function filterWorkOrdersBySite<T extends Pick<WorkOrder,'site_id'>>(
 orders:readonly T[], siteId:string,
):T[]{
 return siteId ? orders.filter(order=>order.site_id===siteId) : [...orders];
}

/** Site IDs are only routing context. /maintenance validates access and
 * ownership before mounting the scoped worklist. */
export function siteMaintenanceLink(organizationId:string,propertyId:string,siteId:string):string{
 return '/maintenance?'+new URLSearchParams({
  organization:organizationId,property:propertyId,site:siteId,
 });
}

/** Direct links carry only operational IDs, never current resident data. */
export function siteMaintenanceWorkLink(
 organizationId:string,propertyId:string,siteId:string,workId:string,
):string{
 const params=new URLSearchParams({
  organization:organizationId,property:propertyId,site:siteId,work:workId,
 });
 return '/maintenance?'+params;
}

/**
 * Treat incoming deep-link work IDs as untrusted until the authorized
 * operations response confirms the original physical site and property.
 * Never fall back to a same-number or same-title job at another site.
 */
export function focusedSiteWorkOrder<T extends Pick<WorkOrder,'id'|'property_id'|'site_id'>>(
 orders:readonly T[],workId:string|undefined,propertyId:string,siteId:string,
):T|undefined{
 if(!workId || workId.length>128 || !propertyId || !siteId)return undefined;
 return orders.find(order=>order.id===workId&&order.property_id===propertyId&&order.site_id===siteId);
}

/** Only allow a writable site at this property as a new work order default.
 * A site ID is never inferred from its label or from the current occupant. */
export function maintenanceFormSiteDefault<T extends {
 id:string;property_id:string;archived_at?:string|null
}>(sites:readonly T[],propertyId:string,requestedSiteId:string|undefined):string{
 return requestedSiteId && sites.some(site=>
  site.id===requestedSiteId&&site.property_id===propertyId&&!site.archived_at)
  ? requestedSiteId : '';
}

/** Navigation only; creating a repair requires the existing authenticated form. */
export function siteMaintenanceCreateLink(organizationId:string,propertyId:string,siteId:string):string{
 return '/maintenance?'+new URLSearchParams({
  organization:organizationId,property:propertyId,site:siteId,create:'repair',
 });
}

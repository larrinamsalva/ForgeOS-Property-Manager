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

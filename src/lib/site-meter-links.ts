import {meterTaskDestination, type MeterUtility} from './meter-actions';

/**
 * Reuse the authorized meter workspace handoffs from the billing board.
 * IDs in these URLs are context, not authorization; /meters revalidates
 * property/site against the signed-in user's permitted snapshot.
 *
 * No resident name, customer/stay ID, phone number, usage, or billing data
 * is placed in these links.
 */
export function siteMeterReviewLinks(
 organizationId:string,
 propertyId:string,
 siteId:string,
):{history:string;review:string;utilities:Record<MeterUtility,string>}{
 const review=(utility?:MeterUtility)=>
  meterTaskDestination('review',organizationId,propertyId,siteId,utility).href;
 return {
  history:meterTaskDestination('inspect',organizationId,propertyId,siteId).href,
  review:review(),
  utilities:{electric:review('electric'),water:review('water'),gas:review('gas')},
 };
}

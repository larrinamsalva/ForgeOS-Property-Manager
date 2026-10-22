export interface VerifiedSubscriptionEvent {
  purpose: 'forgeos_subscriptions';
  providerEventId: string;
  providerCustomerId: string;
  organizationId: string;
  subscriptionId: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  occurredAt: string;
  verifiedAt: string;
}
export interface OrganizationEntitlements {
  organizationId: string;
  source: 'disabled';
  billingActive: false;
  planId: null;
  propertiesLimit: null;
  staffLimit: null;
  residentPortal: true;
  reports: true;
}
/** Inactive commercial boundary: no prices, limits, provider objects or tenant ledger writes. */
export function organizationEntitlements(organizationId: string): OrganizationEntitlements {
  return {
    organizationId,
    source: 'disabled',
    billingActive: false,
    planId: null,
    propertiesLimit: null,
    staffLimit: null,
    residentPortal: true,
    reports: true,
  };
}
export const subscriptionReadiness = {
  status: 'disabled',
  description:
    'ForgeOS subscriptions and organization entitlements have a separate boundary from resident payments and deposit liabilities. Plans, prices, taxes, provider verification and activation require a later owner-approved implementation.',
} as const;

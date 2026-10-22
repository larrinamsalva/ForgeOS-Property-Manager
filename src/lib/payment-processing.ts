/** Future adapter boundary. No implementation, account, checkout route or webhook is active. */
export interface HostedTenantPaymentRequest {
  organizationId: string;
  propertyId: string;
  customerId: string;
  invoiceId: string;
  amountCents: string;
  currency: 'USD';
  idempotencyKey: string;
}
export interface VerifiedTenantSettlement {
  providerEventId: string;
  providerPaymentId: string;
  organizationId: string;
  propertyId: string;
  customerId: string;
  invoiceId: string;
  amountCents: string;
  currency: 'USD';
  status: 'settled' | 'refunded' | 'failed';
  occurredAt: string;
}
export interface TenantCollectionProcessor {
  readonly purpose: 'tenant_collections';
  createHostedCheckout(
    request: HostedTenantPaymentRequest
  ): Promise<{ externalCheckoutId: string; url: string }>;
  verifySettlement(rawBody: Uint8Array, signature: string): Promise<VerifiedTenantSettlement>;
}
/** SaaS subscriptions use a distinct adapter and must never post tenant payments or deposits. */
export interface ForgeOsSubscriptionProcessor {
  readonly purpose: 'forgeos_subscriptions';
  createHostedSubscription(organizationId: string, idempotencyKey: string): Promise<{ url: string }>;
}
export function tenantCollectionProcessor(): TenantCollectionProcessor | null {
  return null;
}
export function forgeOsSubscriptionProcessor(): ForgeOsSubscriptionProcessor | null {
  return null;
}
export const paymentProcessingStatus = {
  tenantCollections: 'disabled',
  forgeOsSubscriptions: 'disabled',
  automaticLateFees: 'disabled',
  outboundReminders: 'disabled',
} as const;

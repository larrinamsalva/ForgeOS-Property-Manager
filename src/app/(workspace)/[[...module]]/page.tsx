import { notFound, redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/config';
import { serverClient } from '@/lib/supabase/server';
import { loadSnapshot } from '@/lib/data';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ module?: string[] }>;
  searchParams: Promise<{ organization?: string; property?: string; site?: string; stay?: string; month?: string }>;
}) {
  if (!configured()) redirect('/setup');
  const { module = [] } = await params;
  const section = module[0] ?? 'overview';
  if (
    module.length > 1 ||
    ![
      'overview',
      'properties',
      'sites',
      'customers',
      'paperless',
      'occupancy',
      'map',
      'access',
      'reservations',
      'leases',
      'meters',
      'billing',
      'collections',
      'maintenance',
      'inventory',
      'operations',
      'reports',
      'communications',
      'commercial',
    ].includes(section)
  )
    notFound();
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/demo');
  const query = await searchParams;
  const snapshot = await loadSnapshot(client, user, query.organization);
  const property = snapshot.properties.some((p) => p.id === query.property) ? (query.property ?? '') : '';
  const billingFocus = section === 'billing' && property &&
    snapshot.sites.some((site) => site.id === query.site && site.property_id === property) &&
    snapshot.stays.some((stay) => stay.id === query.stay && stay.property_id === property && stay.site_id === query.site)
      ? { siteId: query.site!, stayId: query.stay!, month: /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? '') ? query.month : undefined } : undefined;
  return (
    <Workspace
      key={`${snapshot.organizationId}:${section}:${property}`}
      snapshot={snapshot}
      section={section}
      propertyId={property}
      billingFocus={billingFocus}
    />
  );
}

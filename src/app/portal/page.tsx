import { redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/config';
import { serverClient } from '@/lib/supabase/server';
import { ResidentPortal } from '@/components/resident-portal';
export const dynamic = 'force-dynamic';
export default async function Portal() {
  if (!configured()) redirect('/setup');
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login?portal=1');
  const accounts = await client.rpc('portal_accounts');
  return (
    <ResidentPortal
      userId={user.id}
      accounts={accounts.data ?? []}
      initialError={
        accounts.error ? 'Account access could not be loaded. Please reload or contact the office.' : ''
      }
    />
  );
}

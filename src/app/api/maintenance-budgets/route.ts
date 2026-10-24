import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
export const dynamic = 'force-dynamic';
const uuid=z.uuid();
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const budget=z.object({
 organization_id:uuid, property_id:uuid, month, category:z.string().trim().min(1).max(100),
 limit_cents:z.number().int().min(1).max(99999999999),
}).strict();
async function session() {
 const client=await serverClient();
 const {data:{user},error}=await client.auth.getUser();
 return {client,user:error?null:user};
}
export async function GET(request:NextRequest) {
 const parsed=z.object({organization_id:uuid,property_id:uuid}).safeParse({
   organization_id:request.nextUrl.searchParams.get('organization'),
   property_id:request.nextUrl.searchParams.get('property'),
 });
 if(!parsed.success) return NextResponse.json({error:'Invalid property scope.'},{status:400});
 const {client,user}=await session();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const [budgets,audit]=await Promise.all([
   client.from('property_maintenance_budgets').select('id,budget_month,category,limit_cents,updated_at').eq('organization_id',parsed.data.organization_id).eq('property_id',parsed.data.property_id).order('budget_month',{ascending:false}).limit(120),
   client.from('property_maintenance_budget_audit').select('id,budget_month,category,old_limit_cents,new_limit_cents,recorded_at,actor_id').eq('organization_id',parsed.data.organization_id).eq('property_id',parsed.data.property_id).order('recorded_at',{ascending:false}).limit(40),
 ]);
 if(budgets.error||audit.error)return NextResponse.json({error:'Budgets unavailable or access denied. Check database migration and manager permission.'},{status:403});
 return NextResponse.json({budgets:budgets.data,audit:audit.data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest) {
 if(!sameOrigin(request))return NextResponse.json({error:'Origin not allowed.'},{status:403});
 const {client,user}=await session();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const payload=budget.safeParse(await request.json().catch(()=>null));
 if(!payload.success)return NextResponse.json({error:'Provide a valid category, month and positive budget.'},{status:400});
 const {organization_id,property_id,category,limit_cents}=payload.data;
 const budget_month=payload.data.month+'-01';
 // Database RLS and trigger both enforce owner/admin/manager permission.
 const result=await client.from('property_maintenance_budgets').upsert({
 organization_id,property_id,budget_month,category,limit_cents,created_by:user.id,updated_by:user.id,
 },{onConflict:'property_id,budget_month,category'}).select('id').single();
 if(result.error)return NextResponse.json({error:'Could not save budget. Verify manager access and migration.'},{status:403});
 return NextResponse.json({id:result.data.id},{headers:{'Cache-Control':'private, no-store'}});
}

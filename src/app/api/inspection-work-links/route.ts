import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
export const dynamic = 'force-dynamic';
const scope=z.object({organization_id:z.uuid(),property_id:z.uuid(),run_id:z.uuid()});
const input=scope.extend({item_key:z.string().regex(/^item-\d{1,2}$/),work_order_id:z.uuid()});
export async function GET(request:NextRequest){
 const parsed=scope.safeParse({
  organization_id:request.nextUrl.searchParams.get('organization'),
  property_id:request.nextUrl.searchParams.get('property'),
  run_id:request.nextUrl.searchParams.get('run'),
 });
 if(!parsed.success)return NextResponse.json({error:'Invalid inspection scope.'},{status:400});
 const client=await serverClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const {data,error}=await client.from('inspection_work_links').select('id,item_key,work_order_id,created_at,created_by')
  .eq('organization_id',parsed.data.organization_id).eq('property_id',parsed.data.property_id)
  .eq('run_id',parsed.data.run_id);
 if(error)return NextResponse.json({error:'Inspection links unavailable. Check permissions and migration.'},{status:403});
 return NextResponse.json({links:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Origin not allowed.'},{status:403});
 const client=await serverClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Choose a valid inspection item and repair.'},{status:400});
 const {error}=await client.from('inspection_work_links').insert({...parsed.data,created_by:user.id});
 if(error)return NextResponse.json({error:'Could not link repair. Check property access or existing link.'},{status:403});
 return NextResponse.json({success:true},{headers:{'Cache-Control':'private, no-store'}});
}

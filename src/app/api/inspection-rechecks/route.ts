import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
export const dynamic='force-dynamic';
const scope=z.object({organization_id:z.uuid(),property_id:z.uuid(),run_id:z.uuid()});
const entry=scope.extend({inspection_link_id:z.uuid(),outcome:z.enum(['verified','needs_more_work']),notes:z.string().trim().min(3).max(2000)});
export async function GET(req:NextRequest){
 const input=scope.safeParse({organization_id:req.nextUrl.searchParams.get('organization'),property_id:req.nextUrl.searchParams.get('property'),run_id:req.nextUrl.searchParams.get('run')});
 if(!input.success)return NextResponse.json({error:'Invalid inspection scope.'},{status:400});
 const client=await serverClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const links=await client.from('inspection_work_links').select('id').eq('organization_id',input.data.organization_id).eq('property_id',input.data.property_id).eq('run_id',input.data.run_id);
 if(links.error)return NextResponse.json({error:'Inspection links unavailable.'},{status:403});
 const ids=(links.data??[]).map(l=>l.id);
 if(!ids.length)return NextResponse.json({rechecks:[]},{headers:{'Cache-Control':'private, no-store'}});
 const {data,error}=await client.from('inspection_rechecks').select('id,inspection_link_id,outcome,notes,signed_by,signed_at')
 .eq('organization_id',input.data.organization_id).eq('property_id',input.data.property_id).in('inspection_link_id',ids).order('signed_at',{ascending:false});
 if(error)return NextResponse.json({error:'Follow-up records unavailable. Verify permissions and migration.'},{status:403});
 return NextResponse.json({rechecks:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:'Origin not allowed.'},{status:403});
 const client=await serverClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const input=entry.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Choose a repair, decision, and explanatory notes.'},{status:400});
 const {run_id,inspection_link_id,organization_id,property_id,outcome,notes}=input.data;
 const {data:linked,error:linkError}=await client.from('inspection_work_links').select('id')
 .eq('id',inspection_link_id).eq('run_id',run_id).eq('organization_id',organization_id).eq('property_id',property_id).maybeSingle();
 if(linkError||!linked)return NextResponse.json({error:'Inspection repair link unavailable.'},{status:403});
 const {error}=await client.from('inspection_rechecks').insert({organization_id,property_id,inspection_link_id,outcome,notes,signed_by:user.id});
 if(error)return NextResponse.json({error:'Cannot record sign-off. Repair must be completed, and manager access is required.'},{status:403});
 return NextResponse.json({success:true},{headers:{'Cache-Control':'private, no-store'}});
}
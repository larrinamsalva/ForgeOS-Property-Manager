import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {serverClient} from '@/lib/supabase/server';
import {sameOrigin} from '@/lib/request-origin';
export const dynamic='force-dynamic';
const scope=z.object({organization_id:z.uuid(),property_id:z.uuid(),run_id:z.uuid()});
const input=scope.extend({site_id:z.uuid().nullable(),area_label:z.string().trim().min(2).max(120).nullable()})
.refine(v=>(v.site_id===null)!==(v.area_label===null));
export async function GET(req:NextRequest){
 const parsed=scope.safeParse({organization_id:req.nextUrl.searchParams.get('organization'),property_id:req.nextUrl.searchParams.get('property'),run_id:req.nextUrl.searchParams.get('run')});
 if(!parsed.success)return NextResponse.json({error:'Invalid inspection scope.'},{status:400});
 const client=await serverClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const {data,error}=await client.from('inspection_run_locations').select('id,site_id,area_label,created_at,created_by')
 .eq('organization_id',parsed.data.organization_id).eq('property_id',parsed.data.property_id).eq('run_id',parsed.data.run_id).maybeSingle();
 if(error)return NextResponse.json({error:'Inspection location unavailable. Verify permissions and migration.'},{status:403});
 return NextResponse.json({location:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:'Origin not allowed.'},{status:403});
 const client=await serverClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const parsed=input.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Choose a valid site or common area.'},{status:400});
 const {error}=await client.from('inspection_run_locations').insert({...parsed.data,created_by:user.id});
 if(error)return NextResponse.json({error:'Could not save location. A location may already be recorded, or access is restricted.'},{status:403});
 return NextResponse.json({success:true},{headers:{'Cache-Control':'private, no-store'}});
}
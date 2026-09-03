import {NextResponse} from "next/server";
const GAS_URL=process.env.GAS_WEB_APP_URL; const GAS_KEY=process.env.GAS_API_KEY||"";
export async function POST(req:Request){
 try{
  if(!GAS_URL) throw new Error("GAS_WEB_APP_URL belum dikonfigurasi");
  const body=await req.json();
  const r=await fetch(GAS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:GAS_KEY,action:body.action,payload:body.payload||{}}),cache:"no-store"});
  const d=await r.json(); return NextResponse.json(d,{status:d.ok?200:400});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Request failed"},{status:500});}
}
import {NextResponse} from "next/server";

const GAS_URL = process.env.GAS_WEB_APP_URL;
const GAS_KEY = process.env.GAS_API_KEY || "";

async function gas(action:string,payload:Record<string,unknown>={}) {
  if(!GAS_URL) throw new Error("GAS_WEB_APP_URL belum dikonfigurasi");
  const res=await fetch(GAS_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:GAS_KEY,action,payload}),
    cache:"no-store"
  });
  const data=await res.json();
  if(!data.ok) throw new Error(data.error || "Google Apps Script error");
  return data;
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const action=url.searchParams.get("action")||"getOrders";
    return NextResponse.json(await gas(action,{}));
  }catch(e){
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Request failed"},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const action=body.action||"createOrder";
    return NextResponse.json(await gas(action,body.payload||body),{status:action==="createOrder"?201:200});
  }catch(e){
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Request failed"},{status:500});
  }
}
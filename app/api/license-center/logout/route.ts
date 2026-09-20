import {NextResponse} from "next/server";
import {isSameOrigin} from "@/lib/session";
import {LICENSE_CENTER_COOKIE, licenseCenterCookieOptions} from "@/lib/license-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ok:false,error:"Permintaan lintas situs ditolak"},{status:403});
  const res = NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store, max-age=0"}});
  res.cookies.set({...licenseCenterCookieOptions(req,0), name:LICENSE_CENTER_COOKIE, value:""});
  return res;
}

import {NextResponse} from "next/server";
import {clientKey, rateLimit} from "@/lib/gas";
import {isSameOrigin} from "@/lib/session";
import {verifyPassword} from "@/lib/password";
import {
  isLicenseCenterConfigured,
  licenseCenterCookieOptions,
  licenseCenterPasswordHash,
  signLicenseCenterSession
} from "@/lib/license-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {"Cache-Control": "no-store, max-age=0"};

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ok:false,error:"Permintaan lintas situs ditolak"},{status:403,headers:noStore});
  if (!isLicenseCenterConfigured()) return NextResponse.json({ok:false,error:"License Center belum dikonfigurasi di environment server"},{status:503,headers:noStore});
  if (!rateLimit(clientKey(req,"license-center-login"), 8, 15*60_000)) {
    return NextResponse.json({ok:false,error:"Terlalu banyak percobaan login. Coba lagi beberapa menit."},{status:429,headers:noStore});
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const password = String(body.password || "").slice(0,256);
  if (!password) return NextResponse.json({ok:false,error:"Password wajib diisi"},{status:400,headers:noStore});
  const ok = await verifyPassword(password, licenseCenterPasswordHash());
  if (!ok) return NextResponse.json({ok:false,error:"Password License Center salah"},{status:401,headers:noStore});
  const res = NextResponse.json({ok:true},{headers:noStore});
  res.cookies.set({...licenseCenterCookieOptions(req), value: signLicenseCenterSession()});
  return res;
}

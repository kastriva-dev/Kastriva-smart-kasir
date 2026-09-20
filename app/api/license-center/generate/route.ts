import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {clientKey, rateLimit} from "@/lib/gas";
import {isSameOrigin} from "@/lib/session";
import {createLicenseCode, type LicensePayload} from "@/lib/license";
import {hasLicenseCenterAccess, isLicenseCenterConfigured} from "@/lib/license-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {"Cache-Control":"no-store, max-age=0"};
const PLANS = new Set(["STARTER","PRO","BUSINESS"]);

function text(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
}
function integer(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}
function slug(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toUpperCase().slice(0,24);
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ok:false,error:"Permintaan lintas situs ditolak"},{status:403,headers:noStore});
  if (!isLicenseCenterConfigured()) return NextResponse.json({ok:false,error:"License Center belum dikonfigurasi"},{status:503,headers:noStore});
  if (!hasLicenseCenterAccess(req)) return NextResponse.json({ok:false,error:"Session License Center tidak valid"},{status:401,headers:noStore});
  if (!rateLimit(clientKey(req,"license-center-generate"), 60, 60*60_000)) {
    return NextResponse.json({ok:false,error:"Batas pembuatan lisensi sementara tercapai"},{status:429,headers:noStore});
  }
  const raw = await req.json().catch(() => ({})) as Record<string, unknown>;
  const installationId = text(raw.installationId,80).toUpperCase();
  const plan = text(raw.plan,20).toUpperCase();
  const days = integer(raw.days,1,3650);
  const maxOutlets = integer(raw.maxOutlets,1,100);
  const customer = text(raw.customer,80);
  const requestedId = text(raw.licenseId,100).toUpperCase();

  if (!/^[A-Z0-9][A-Z0-9_-]{7,79}$/.test(installationId)) return NextResponse.json({ok:false,error:"Installation ID tidak valid"},{status:400,headers:noStore});
  if (!PLANS.has(plan)) return NextResponse.json({ok:false,error:"Plan lisensi tidak valid"},{status:400,headers:noStore});
  if (!Number.isFinite(days)) return NextResponse.json({ok:false,error:"Masa aktif harus 1-3650 hari"},{status:400,headers:noStore});
  if (!Number.isFinite(maxOutlets)) return NextResponse.json({ok:false,error:"Batas outlet harus 1-100"},{status:400,headers:noStore});

  const customerPart = slug(customer) || "CUSTOMER";
  if (requestedId && !/^[A-Z0-9][A-Z0-9._-]{2,99}$/.test(requestedId)) return NextResponse.json({ok:false,error:"License ID hanya boleh huruf, angka, titik, garis bawah, dan strip"},{status:400,headers:noStore});
  const licenseId = requestedId || `LIC-${customerPart}-${randomUUID().slice(0,8).toUpperCase()}`;
  const activeUntil = new Date(Date.now() + days*86_400_000).toISOString();
  const payload: LicensePayload = {
    licenseId,
    installationId,
    plan: plan as LicensePayload["plan"],
    activeUntil,
    maxOutlets
  };
  const code = createLicenseCode(payload);
  return NextResponse.json({ok:true,data:{code,payload,days,customer,issuedAt:new Date().toISOString()}},{headers:noStore});
}

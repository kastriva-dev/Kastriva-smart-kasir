import {createHmac, randomUUID} from "node:crypto";

const [planRaw="PRO", daysRaw="365", maxRaw="3", idRaw="", installationRaw=""] = process.argv.slice(2);
const secret = String(process.env.LICENSE_SIGNING_SECRET || "").trim();
if (secret.length < 32) {
  console.error("Set LICENSE_SIGNING_SECRET minimal 32 karakter sebelum membuat lisensi.");
  process.exit(1);
}
const plan = String(planRaw).toUpperCase();
if (!["STARTER","PRO","BUSINESS"].includes(plan)) throw new Error("Plan: STARTER | PRO | BUSINESS");
const days = Math.max(1, Math.floor(Number(daysRaw) || 365));
const maxOutlets = Math.min(100, Math.max(1, Math.floor(Number(maxRaw) || 1)));
const installationId = String(installationRaw || "").trim();
if (!installationId) {
  console.error("Installation ID wajib. Salin dari Owner & SaaS pelanggan.");
  process.exit(1);
}
const payload = {
  licenseId: idRaw || `LIC-${randomUUID().slice(0,8).toUpperCase()}`,
  installationId,
  plan,
  activeUntil: new Date(Date.now() + days * 86400000).toISOString(),
  maxOutlets
};
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = createHmac("sha256", secret).update(`KSP1.${body}`).digest("base64url");
console.log(`KSP1.${body}.${sig}`);
console.error(JSON.stringify(payload, null, 2));

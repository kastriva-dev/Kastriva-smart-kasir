/**
 * Tes unit untuk lapisan validasi lib/gas.ts.
 * File TS di-transpile lewat loader TypeScript bawaan Node 22+/24 (--experimental-strip-types).
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.ADMIN_API_TOKEN = "token-admin-uji";
process.env.AUTH_SECRET = "secret-uji-panjang-minimal-32-karakter";

const {
  ADMIN_ACTIONS,
  PUBLIC_ACTIONS,
  assertActionAllowed,
  hasAdminAccess,
  isKnownAction,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeDeleteData,
  sanitizePayOrder,
  sanitizeSaveSettings,
  sanitizeStatusUpdate
} = await import("../lib/gas.ts");
const {signSession, SESSION_COOKIE} = await import("../lib/session.ts");

const req = (headers = {}) => new Request("http://localhost/api/orders", {headers});

test("allowlist action", () => {
  assert.equal(isKnownAction("createOrder"), true);
  assert.equal(isKnownAction("getMenu"), true);
  assert.equal(isKnownAction("getSettings"), true);
  assert.equal(isKnownAction("payOrder"), true);
  assert.equal(isKnownAction("dropDatabase"), false);
  assert.equal(isKnownAction(""), false);
  assert.equal(PUBLIC_ACTIONS.has("deleteMenu"), false);
  assert.equal(ADMIN_ACTIONS.has("deleteMenu"), true);
  assert.equal(ADMIN_ACTIONS.has("getSettings"), false, "getSettings harus publik");
});

test("action publik tidak butuh token, action admin butuh kredensial", async () => {
  await assert.doesNotReject(() => assertActionAllowed("createOrder", req()));
  await assert.rejects(() => assertActionAllowed("deleteMenu", req()), /Unauthorized/);
  await assert.rejects(() => assertActionAllowed("deleteMenu", req({"x-admin-token": "salah"})), /Unauthorized/);
  await assert.doesNotReject(() => assertActionAllowed("deleteMenu", req({"x-admin-token": "token-admin-uji"})));
  await assert.doesNotReject(() =>
    assertActionAllowed("deleteMenu", req({authorization: "Bearer token-admin-uji"}))
  );
  await assert.rejects(
    () => assertActionAllowed("rm -rf", req({"x-admin-token": "token-admin-uji"})),
    /tidak diizinkan/
  );
});

test("hasAdminAccess menolak token kosong dan salah panjang", async () => {
  assert.equal(await hasAdminAccess(req()), false);
  assert.equal(await hasAdminAccess(req({"x-admin-token": ""})), false);
  assert.equal(await hasAdminAccess(req({"x-admin-token": "token-admin-uji-lebih-panjang"})), false);
  assert.equal(await hasAdminAccess(req({"x-admin-token": "token-admin-uji"})), true);
});

test("session login sah dihitung sebagai admin (UI tidak perlu token)", async () => {
  const token = await signSession({sub: "admin", role: "admin"});
  const authed = req({cookie: `${SESSION_COOKIE}=${token}`});
  assert.equal(await hasAdminAccess(authed), true);
  await assert.doesNotReject(() => assertActionAllowed("getOrders", authed));

  const forged = req({cookie: `${SESSION_COOKIE}=${token.slice(0, -2)}xx`});
  assert.equal(await hasAdminAccess(forged), false);
});

test("assertActionAllowed mengembalikan status admin untuk penandaan _admin", async () => {
  assert.equal(await assertActionAllowed("createOrder", req()), false, "publik bukan admin");
  assert.equal(await assertActionAllowed("createOrder", req({"x-admin-token": "token-admin-uji"})), true);
  assert.equal(await assertActionAllowed("getMenu", req()), false);
});

test("sanitizeCreateOrder membuang harga dari client", () => {
  const out = sanitizeCreateOrder({
    storeId: "kastriva",
    tableCode: "meja-01",
    items: [{menuItemId: "m1", name: "Beef", qty: 2, price: 1, cost: 0}]
  });
  assert.equal("price" in out.items[0], false, "price tidak boleh diteruskan");
  assert.equal(out.items[0].qty, 2);
  assert.equal(out.channel, "QR");
  assert.equal(out.discount, 0, "pelanggan publik tidak boleh mengirim diskon");
});

test("diskon hanya diteruskan untuk request admin", () => {
  const payload = {discount: 25000, items: [{menuItemId: "m1", qty: 1}]};
  assert.equal(sanitizeCreateOrder(payload).discount, 0, "publik: diskon dibuang");
  assert.equal(sanitizeCreateOrder(payload, {admin: true}).discount, 25000, "admin: diskon diteruskan");
  assert.equal(sanitizeCreateOrder({discount: -5, items: [{menuItemId: "m1", qty: 1}]}, {admin: true}).discount, 0);
});

test("sanitizeCreateOrder menolak input tidak valid", () => {
  assert.throws(() => sanitizeCreateOrder(null), /tidak valid/);
  assert.throws(() => sanitizeCreateOrder({items: []}), /kosong/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 0}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 1.5}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 100}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{qty: 1}]}), /menuItemId/);
  assert.throws(() => sanitizeCreateOrder({items: new Array(61).fill({menuItemId: "m1", qty: 1})}), /Terlalu banyak/);
});

test("sanitizeCreateOrder memotong dan membersihkan teks", () => {
  const out = sanitizeCreateOrder({
    customerName: "  Budi\u0000Santoso  ",
    note: "x".repeat(500),
    phone: "+62 811-2222-3333",
    channel: "wa",
    items: [{menuItemId: "m1", qty: 1}]
  });
  assert.equal(out.customerName.includes("\u0000"), false);
  assert.equal(out.note.length, 300);
  assert.equal(out.phone, "+6281122223333");
  assert.equal(out.channel, "WA");
});

test("channel asing jatuh ke QR", () => {
  const out = sanitizeCreateOrder({channel: "TELEPATI", items: [{menuItemId: "m1", qty: 1}]});
  assert.equal(out.channel, "QR");
});

test("sanitizeStatusUpdate memvalidasi status", () => {
  assert.deepEqual(sanitizeStatusUpdate({id: "ORD-1", status: "paid"}), {
    id: "ORD-1",
    status: "PAID",
    userId: "staff"
  });
  assert.throws(() => sanitizeStatusUpdate({status: "PAID"}), /id pesanan/);
  assert.throws(() => sanitizeStatusUpdate({id: "ORD-1", status: "HACKED"}), /tidak valid/);
});

test("sanitizePayOrder memvalidasi metode & nominal", () => {
  assert.deepEqual(sanitizePayOrder({id: "ORD-1", method: "qris"}), {
    id: "ORD-1",
    method: "QRIS",
    paidAmount: 0,
    userId: "staff"
  });
  assert.equal(sanitizePayOrder({id: "ORD-1", method: "CASH", paidAmount: 100500}).paidAmount, 100500);
  assert.throws(() => sanitizePayOrder({id: "ORD-1", method: "JUMBO"}), /Metode pembayaran/);
  assert.throws(() => sanitizePayOrder({method: "CASH"}), /id pesanan/);
});

test("sanitizeDeleteData hanya mengizinkan sheet whitelist", () => {
  assert.deepEqual(sanitizeDeleteData({sheet: "Menu", id: "m1"}), {sheet: "Menu", id: "m1"});
  assert.throws(() => sanitizeDeleteData({sheet: "Orders", id: "o1"}), /whitelist|tidak boleh/i);
  assert.throws(() => sanitizeDeleteData({sheet: "Menu"}), /id wajib/);
});

test("sanitizeSaveSettings membersihkan tarif", () => {
  const out = sanitizeSaveSettings({name: " Kafe Kita ", phone: "0811-a", taxRate: 11, serviceRate: -3});
  assert.equal(out.name, "Kafe Kita");
  assert.equal(out.phone, "0811");
  assert.equal(out.taxRate, 11);
  assert.equal(out.serviceRate, 0, "tarif negatif dipangkas ke 0");
});

test("rateLimit menghitung per kunci dan reset setelah jendela", async () => {
  const key = `uji-${Math.random()}`;
  assert.equal(rateLimit(key, 2, 50), true);
  assert.equal(rateLimit(key, 2, 50), true);
  assert.equal(rateLimit(key, 2, 50), false);
  assert.equal(rateLimit(`${key}-lain`, 2, 50), true, "kunci lain tidak terpengaruh");
  await new Promise(r => setTimeout(r, 70));
  assert.equal(rateLimit(key, 2, 50), true, "jendela sudah reset");
});

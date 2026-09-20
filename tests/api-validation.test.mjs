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
  assertStatusAllowedForRole,
  hasAdminAccess,
  isKnownAction,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeCreatePurchase,
  sanitizeInventoryAdjustment,
  sanitizePurchaseAction,
  sanitizeSaveRecipe,
  sanitizeSaveSupplier,
  sanitizeDeleteData,
  sanitizePayOrder,
  sanitizeRefundOrder,
  sanitizeSaveSettings,
  sanitizeSaveStore,
  sanitizeSavePromotion,
  sanitizeSaveVoucher,
  sanitizeSplitOrder,
  sanitizeStatusUpdate
} = await import("../lib/gas.ts");
const {signSession, SESSION_COOKIE} = await import("../lib/session.ts");

const req = (headers = {}) => new Request("http://localhost/api/orders", {headers});

test("allowlist action", () => {
  assert.equal(isKnownAction("createOrder"), true);
  assert.equal(isKnownAction("getMenu"), true);
  assert.equal(isKnownAction("getSettings"), true);
  assert.equal(isKnownAction("payOrder"), true);
  assert.equal(isKnownAction("refundOrder"), true);
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

test("assertActionAllowed mengembalikan context actor", async () => {
  const guest = await assertActionAllowed("createOrder", req());
  assert.equal(guest.authenticated, false);
  assert.equal(guest.role, "guest");
  const admin = await assertActionAllowed("createOrder", req({"x-admin-token": "token-admin-uji"}));
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.role, "admin");
});

test("role staff dibatasi server-side", async () => {
  const cashierToken = await signSession({sub:"stf-1", role:"cashier", name:"Rina"});
  const cashierReq = req({cookie:`${SESSION_COOKIE}=${cashierToken}`});
  await assert.doesNotReject(() => assertActionAllowed("payOrder", cashierReq));
  await assert.rejects(() => assertActionAllowed("saveSettings", cashierReq), /role tidak diizinkan/i);
  assert.doesNotThrow(() => assertStatusAllowedForRole("cashier", "CONFIRMED"));
  assert.throws(() => assertStatusAllowedForRole("cashier", "COOKING"), /tidak boleh/);
  assert.doesNotThrow(() => assertStatusAllowedForRole("kitchen", "CONFIRMED"));
  assert.doesNotThrow(() => assertStatusAllowedForRole("kitchen", "COOKING"));
  assert.throws(() => assertStatusAllowedForRole("kitchen", "CANCELLED"), /tidak boleh/);
});

test("sanitizeCreateOrder membuang harga dari client", () => {
  const out = sanitizeCreateOrder({
    storeId: "kastriva",
    tableCode: "meja-01",
    clientOrderId: " QR-abc-123 ",
    items: [{menuItemId: "m1", name: "Beef", qty: 2, price: 1, cost: 0}]
  });
  assert.equal("price" in out.items[0], false, "price tidak boleh diteruskan");
  assert.equal(out.items[0].qty, 2);
  assert.equal(out.channel, "QR");
  assert.equal(out.clientOrderId, "QR-abc-123");
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
  assert.deepEqual(sanitizeStatusUpdate({id: "ORD-1", status: "cancelled", reason: " salah input "}), {
    id: "ORD-1",
    status: "CANCELLED",
    reason: "salah input",
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
    reference: "",
    userId: "staff"
  });
  assert.equal(sanitizePayOrder({id: "ORD-1", method: "CASH", paidAmount: 100500}).paidAmount, 100500);
  assert.throws(() => sanitizePayOrder({id: "ORD-1", method: "JUMBO"}), /Metode pembayaran/);
  assert.throws(() => sanitizePayOrder({method: "CASH"}), /id pesanan/);
});

test("sanitizeRefundOrder mewajibkan alasan dan membersihkan restock", () => {
  assert.deepEqual(sanitizeRefundOrder({id: "ORD-1", reason: " barang kembali ", restock: true}), {
    id: "ORD-1",
    reason: "barang kembali",
    restock: true,
    userId: "staff"
  });
  assert.throws(() => sanitizeRefundOrder({id: "ORD-1", reason: ""}), /Alasan refund/);
  assert.throws(() => sanitizeRefundOrder({reason: "x"}), /id pesanan/);
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


test("Stage 3 sanitizer supplier, recipe, purchase, dan adjustment", () => {
  assert.equal(sanitizeSaveSupplier({name:" Vendor A ", phone:"0812-x"}).name, "Vendor A");
  assert.throws(() => sanitizeSaveSupplier({name:""}), /supplier wajib/);

  assert.deepEqual(sanitizeSaveRecipe({menuItemId:"m1", items:[{inventoryId:"i1", qty:0.5}]}), {
    menuItemId:"m1", items:[{inventoryId:"i1", qty:0.5}]
  });
  assert.throws(() => sanitizeSaveRecipe({menuItemId:"m1", items:[{inventoryId:"i1", qty:0}]}), /Qty resep/);

  const purchase = sanitizeCreatePurchase({supplierId:"s1", invoiceNo:" INV ", items:[{inventoryId:"i1", qty:2, unitCost:15000}]});
  assert.equal(purchase.supplierId, "s1");
  assert.equal(purchase.items[0].unitCost, 15000);
  assert.throws(() => sanitizeCreatePurchase({supplierId:"s1", items:[]}), /memiliki item/);

  assert.deepEqual(sanitizePurchaseAction({id:"po1"}), {id:"po1", reason:""});
  assert.throws(() => sanitizePurchaseAction({id:"po1"}, true), /Alasan pembatalan/);
  assert.deepEqual(sanitizeInventoryAdjustment({id:"i1", type:"WASTE", qty:2, reason:"rusak"}), {id:"i1", type:"WASTE", reason:"rusak", qty:2});
  assert.throws(() => sanitizeInventoryAdjustment({id:"i1", type:"WASTE", qty:0, reason:"x"}), /lebih dari 0/);
});

test("Stage 3 action inventory pro hanya manager/admin", async () => {
  const managerToken = await signSession({sub:"mgr-1", role:"manager", name:"Manager"});
  const managerReq = req({cookie:`${SESSION_COOKIE}=${managerToken}`});
  await assert.doesNotReject(() => assertActionAllowed("createPurchase", managerReq));
  await assert.doesNotReject(() => assertActionAllowed("saveRecipe", managerReq));

  const cashierToken = await signSession({sub:"kasir-1", role:"cashier", name:"Kasir"});
  const cashierReq = req({cookie:`${SESSION_COOKIE}=${cashierToken}`});
  await assert.rejects(() => assertActionAllowed("createPurchase", cashierReq), /role tidak diizinkan/i);
  await assert.rejects(() => assertActionAllowed("adjustInventory", cashierReq), /role tidak diizinkan/i);
});


test("Stage 5 sanitizer meneruskan promo/redeem hanya untuk admin dan membersihkan voucher publik", () => {
  const pub = sanitizeCreateOrder({promoId:"promo-x", voucherCode:" hemat-10 ", pointsToRedeem:50, manualDiscountType:"PERCENT", manualDiscountValue:25, items:[{menuItemId:"m1", qty:1}]});
  assert.equal(pub.promoId, "");
  assert.equal(pub.pointsToRedeem, 0);
  assert.equal(pub.manualDiscountValue, 0);
  assert.equal(pub.voucherCode, "HEMAT-10");

  const admin = sanitizeCreateOrder({promoId:"promo-x", voucherCode:"vip_20", pointsToRedeem:50, manualDiscountType:"PERCENT", manualDiscountValue:25, items:[{menuItemId:"m1", qty:1}]}, {admin:true});
  assert.equal(admin.promoId, "promo-x");
  assert.equal(admin.pointsToRedeem, 50);
  assert.equal(admin.manualDiscountType, "PERCENT");
  assert.equal(admin.manualDiscountValue, 25);
  assert.equal(admin.voucherCode, "VIP_20");
});

test("Stage 5 split payment sanitizer membatasi metode, nominal, dan duplikasi", () => {
  const out = sanitizePayOrder({id:"ORD-1", payments:[
    {method:"cash", amount:30000, receivedAmount:50000},
    {method:"qris", amount:40000, reference:" trx-1 "}
  ]});
  assert.equal(out.id, "ORD-1");
  assert.deepEqual(out.payments, [
    {method:"CASH", amount:30000, receivedAmount:50000, reference:""},
    {method:"QRIS", amount:40000, receivedAmount:40000, reference:"trx-1"}
  ]);
  assert.throws(() => sanitizePayOrder({id:"ORD-1", payments:[{method:"CASH",amount:1},{method:"cash",amount:2}]}), /duplikat/i);
  assert.throws(() => sanitizePayOrder({id:"ORD-1", payments:[{method:"CASH",amount:0}]}), /Nominal pembayaran/);
});

test("Stage 5 sanitizer promo, voucher, split bill, dan loyalty settings", () => {
  const promo = sanitizeSavePromotion({name:" Weekend ", type:"percent", value:150, minSpend:10000});
  assert.equal(promo.name, "Weekend");
  assert.equal(promo.type, "PERCENT");
  assert.equal(promo.value, 100);

  const voucher = sanitizeSaveVoucher({code:" vip 20!! ", type:"fixed", value:20000, usageLimit:5});
  assert.equal(voucher.code, "VIP20");
  assert.equal(voucher.value, 20000);
  assert.equal(voucher.usageLimit, 5);

  assert.deepEqual(sanitizeSplitOrder({id:"ORD-1", items:[{orderItemId:"OI-1", qty:2}]}), {id:"ORD-1",items:[{orderItemId:"OI-1",qty:2}]});
  assert.throws(() => sanitizeSplitOrder({id:"ORD-1",items:[]}), /Pilih item/);

  const settings = sanitizeSaveSettings({loyaltyEnabled:false, loyaltySpendPerPoint:25000, loyaltyPointValue:250, maxRedeemPercent:45});
  assert.equal(settings.loyaltyEnabled, false);
  assert.equal(settings.loyaltySpendPerPoint, 25000);
  assert.equal(settings.loyaltyPointValue, 250);
  assert.equal(settings.maxRedeemPercent, 45);
});

test("Stage 5 role permission: kasir boleh promo read/split, manager boleh kelola promo", async () => {
  const cashierToken = await signSession({sub:"kasir-5", role:"cashier", name:"Kasir"});
  const cashierReq = req({cookie:`${SESSION_COOKIE}=${cashierToken}`});
  await assert.doesNotReject(() => assertActionAllowed("splitOrder", cashierReq));
  await assert.doesNotReject(() => assertActionAllowed("getPromotions", cashierReq));
  await assert.rejects(() => assertActionAllowed("savePromotion", cashierReq), /role tidak diizinkan/i);

  const managerToken = await signSession({sub:"mgr-5", role:"manager", name:"Manager"});
  const managerReq = req({cookie:`${SESSION_COOKIE}=${managerToken}`});
  await assert.doesNotReject(() => assertActionAllowed("savePromotion", managerReq));
  await assert.doesNotReject(() => assertActionAllowed("saveVoucher", managerReq));
});


test("Stage 6 sanitizer outlet dan permission Owner", async () => {
  const out = sanitizeSaveStore({name:" Cabang Karawang ", slug:"Cabang Karawang!!", phone:"0812-x", taxRate:11, serviceRate:-2});
  assert.equal(out.name, "Cabang Karawang");
  assert.equal(out.slug, "cabang-karawang");
  assert.equal(out.phone, "0812");
  assert.equal(out.serviceRate, 0);
  assert.throws(() => sanitizeSaveStore({name:""}), /Nama outlet/);

  const ownerToken = await signSession({sub:"owner", role:"admin", name:"Owner", storeId:"store-001"});
  const ownerReq = req({cookie:`${SESSION_COOKIE}=${ownerToken}`});
  await assert.doesNotReject(() => assertActionAllowed("getOwnerDashboard", ownerReq));
  await assert.doesNotReject(() => assertActionAllowed("saveStore", ownerReq));

  const managerToken = await signSession({sub:"mgr", role:"manager", name:"Manager", storeId:"store-001"});
  const managerReq = req({cookie:`${SESSION_COOKIE}=${managerToken}`});
  await assert.rejects(() => assertActionAllowed("getOwnerDashboard", managerReq), /role tidak diizinkan/i);
  await assert.rejects(() => assertActionAllowed("saveStore", managerReq), /role tidak diizinkan/i);
  await assert.doesNotReject(() => assertActionAllowed("getAnalytics", managerReq));
  await assert.doesNotReject(() => assertActionAllowed("getSyncState", managerReq));
});

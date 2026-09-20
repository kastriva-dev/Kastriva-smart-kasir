/** Tes backend Google Apps Script (gas/Code.gs) memakai stub Sheets. */
import assert from "node:assert/strict";
import test from "node:test";
import {createGasSandbox} from "./helpers/gas-sandbox.mjs";

const KEY = "rahasia-panjang";

function bootstrapped() {
  const env = createGasSandbox({apiKey: KEY});
  env.gas.setupDatabase();
  return env;
}

test("auth fail-closed saat GAS_API_KEY belum diisi", () => {
  const env = createGasSandbox({apiKey: ""});
  assert.throws(() => env.gas.auth_("apa-saja"), /belum dikonfigurasi/);
  const res = env.post({action: "health"});
  assert.equal(res.ok, false);
});

test("auth menolak key salah dan menerima key benar", () => {
  const env = createGasSandbox({apiKey: KEY});
  assert.throws(() => env.gas.auth_("salah"), /Unauthorized/);
  assert.throws(() => env.gas.auth_(""), /Unauthorized/);
  assert.doesNotThrow(() => env.gas.auth_(KEY));
});

test("setupDatabase membuat 24 sheet dengan header dan seed", () => {
  const env = bootstrapped();
  assert.equal(env.sheets.size, 24);
  assert.deepEqual(env.sheets.get("Orders").rows[0], env.gas.HEADERS.Orders);
  assert.equal(env.sheets.get("Menu").rows.length, 10); // header + 9 menu
  assert.equal(env.sheets.get("Orders").frozen, 1);
});

test("setupDatabase idempoten: data lama tidak dihapus", () => {
  const env = bootstrapped();
  const before = env.sheets.get("Menu").rows.length;
  env.gas.setupDatabase();
  assert.equal(env.sheets.get("Menu").rows.length, before);
});

test("setupDatabase menambah kolom yang hilang, bukan menghapus sheet", () => {
  const env = bootstrapped();
  const inv = env.sheets.get("Inventory");
  inv.rows = [["id", "storeId", "name"], ["i1", "store-001", "Beras"]];
  env.gas.setupDatabase();
  assert.equal(inv.rows[0].length, env.gas.HEADERS.Inventory.length);
  assert.equal(inv.rows.length, 2);
  assert.equal(inv.rows[1][2], "Beras");
});

test("createOrder menghitung harga dari sheet dan mengabaikan harga client", () => {
  const env = bootstrapped();
  const res = env.call("createOrder", {
    storeId: "kastriva",
    tableCode: "meja-03",
    customerName: "Budi",
    phone: "+62 811-2222-3333",
    channel: "QR",
    items: [
      {menuItemId: "m1", qty: 2, price: 1},
      {menuItemId: "m4", qty: 1, price: 0}
    ]
  });

  assert.equal(res.ok, true);
  const order = res.data;
  assert.equal(order.subtotal, 435000); // 2*185000 + 65000
  assert.equal(order.service, 21750); // serviceRate seed 5%
  assert.equal(order.tax, 0);
  assert.equal(order.total, 456750);
  assert.equal(order.items[0].price, 185000, "harga client harus diabaikan");
  assert.equal(order.status, "NEW");
  assert.equal(order.tableId, "table-3");
  assert.equal(order.phone, "+6281122223333");
  assert.equal(env.sheets.get("OrderItems").rows.length, 3);
  assert.equal(env.sheets.get("Customers").rows.length, 2);
});

test("createOrder menolak payload tidak valid", () => {
  const env = bootstrapped();
  const bad = payload => env.call("createOrder", payload).ok;
  assert.equal(bad({items: []}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: 0}]}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: 100}]}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: -3}]}), false);
  assert.equal(bad({items: [{menuItemId: "tidak-ada", qty: 1}]}), false);
  assert.equal(bad({items: new Array(61).fill({menuItemId: "m1", qty: 1})}), false);
});

test("menu nonaktif tidak bisa dipesan dan tidak muncul di getMenu", () => {
  const env = bootstrapped();
  env.sheets.get("Menu").rows[1][8] = false; // m1.active = false
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}]}).ok, false);
  assert.ok(env.call("getMenu", {}).data.every(m => m.id !== "m1"));
});

test("updateOrderStatus memvalidasi state machine dan PAID hanya lewat pembayaran", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data;
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "CONFIRMED"}).data.status, "CONFIRMED");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "COOKING"}).data.status, "COOKING");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "NEW"}).ok, false, "status tidak boleh mundur");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "PAID"}).ok, false, "PAID wajib lewat payOrder");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "HACK"}).ok, false);
  assert.equal(env.call("updateOrderStatus", {id: "ORD-XXX", status: "READY"}).ok, false);
  assert.equal(env.call("updateOrderStatus", {status: "READY"}).ok, false);
});

test("getOrder menyertakan item, getOrders menghormati limit", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}, {menuItemId: "m2", qty: 2}]}).data;
  const fetched = env.call("getOrder", {id: order.id});
  assert.equal(fetched.data.items.length, 2);

  env.call("createOrder", {items: [{menuItemId: "m3", qty: 1}]});
  assert.equal(env.call("getOrders", {limit: 1}).data.length, 1);
  assert.ok(env.call("getOrders", {}).data.length >= 2);
});

test("saveMenu dan deleteMenu", () => {
  const env = bootstrapped();
  const saved = env.call("saveMenu", {name: "Es Teh", price: 12000, cost: 3000, stock: 50, storeId: "store-001"});
  assert.equal(saved.ok, true);
  assert.ok(saved.data.id);
  assert.equal(env.call("saveMenu", {name: "Gratisan", price: -5}).data.price, 0);
  assert.equal(env.call("saveMenu", {price: 100}).ok, false, "nama wajib");
  assert.equal(env.call("deleteMenu", {id: saved.data.id}).ok, true);
  assert.equal(env.call("deleteMenu", {id: "nope"}).ok, false);
});

test("action tidak dikenal ditolak", () => {
  const env = bootstrapped();
  assert.equal(env.call("dropTable", {}).ok, false);
});

test("lock mencegah tulis bersamaan", () => {
  const env = bootstrapped();
  env.holdLock(true);
  const busy = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]});
  assert.equal(busy.ok, false);
  assert.match(busy.error, /sibuk/);
  env.holdLock(false);
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).ok, true);
});

test("doGet menghormati auth", () => {
  const env = bootstrapped();
  assert.equal(env.get({key: KEY, action: "getMenu"}).ok, true);
  assert.equal(env.get({key: "salah", action: "getMenu"}).ok, false);
});

/* ---------- Pembayaran, laporan, stok, pengaturan ---------- */

test("payOrder mencatat tunai, kembalian, dan status PAID", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}]}).data;
  const bad = env.call("payOrder", {id: order.id, method: "CASH", paidAmount: 1000});
  assert.equal(bad.ok, false, "tunai kurang dari total harus ditolak");

  const paid = env.call("payOrder", {id: order.id, method: "CASH", paidAmount: 200000});
  assert.equal(paid.ok, true);
  assert.equal(paid.data.status, "PAID");
  assert.equal(paid.data.paymentMethod, "CASH");
  assert.equal(paid.data.paidAmount, 200000);
  assert.equal(paid.data.changeAmount, 200000 - paid.data.total);

  const qris = env.call("payOrder", {id: env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data.id, method: "QRIS"});
  assert.equal(qris.data.paidAmount, qris.data.total, "non-tunai selalu pas");
  assert.equal(qris.data.changeAmount, 0);
  assert.equal(env.call("payOrder", {id: order.id, method: "JUMBO"}).ok, false);
});

test("stok berkurang saat order dan habis ditolak", () => {
  const env = bootstrapped();
  const before = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  const stockAwal = Number(before[7]);

  const res = env.call("createOrder", {items: [{menuItemId: "m3", qty: 2}]});
  assert.equal(res.ok, true);
  const after = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  assert.equal(Number(after[7]), stockAwal - 2, "stok harus berkurang sebesar qty");

  const sisa = Number(after[7]);
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m3", qty: sisa + 1}]}).ok, false, "stok kurang ditolak");
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m3", qty: sisa}]}).ok, true);
  const habis = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  assert.equal(Number(habis[7]), 0);

  // Menu tanpa stok terlacak (string kosong) tidak dibatasi.
  const m1 = env.sheets.get("Menu").rows.find(r => r[0] === "m1");
  m1[7] = "";
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m1", qty: 50}]}).ok, true);
});

test("diskon hanya dihormati untuk request admin (_admin)", () => {
  const env = bootstrapped();
  const publik = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}], discount: 100000});
  assert.equal(publik.data.discount, 0, "tanpa _admin diskon diabaikan");

  const admin = env.call("createOrder", {_admin: true, items: [{menuItemId: "m1", qty: 1}], discount: 100000});
  assert.equal(admin.data.discount, 100000);
  assert.equal(admin.data.total, publik.data.subtotal - 100000 + publik.data.service);

  const berlebih = env.call("createOrder", {_admin: true, items: [{menuItemId: "m1", qty: 1}], discount: 99999999});
  assert.equal(berlebih.data.discount, berlebih.data.subtotal, "diskon tidak melebihi subtotal");
  assert.equal(berlebih.data.total, berlebih.data.service, "subtotal-0 berarti hanya pajak/service");
});

test("getMenu menyertakan nama kategori", () => {
  const env = bootstrapped();
  const menu = env.call("getMenu", {}).data;
  const beef = menu.find(m => m.id === "m1");
  assert.equal(beef.category, "Main Course");
});

test("getSettings & saveSettings", () => {
  const env = bootstrapped();
  const settings = env.call("getSettings", {}).data;
  assert.equal(settings.storeName, "Kastriva Grand Dining");
  assert.equal(Number(settings.serviceRate), 5);

  const saved = env.call("saveSettings", {name: "Kafe Baru", taxRate: 11, serviceRate: 0, phone: "0811xxx"});
  assert.equal(saved.ok, true);
  assert.equal(saved.data.name, "Kafe Baru");
  assert.equal(Number(saved.data.taxRate), 11);
  assert.equal(Number(saved.data.serviceRate), 0);
  const after = env.call("getSettings", {}).data;
  assert.equal(after.storeName, "Kafe Baru");
  assert.equal(Number(after.taxRate), 11);
});

test("getReport merangkum penjualan hari ini", () => {
  const env = bootstrapped();
  const o1 = env.call("createOrder", {items: [{menuItemId: "m1", qty: 2}, {menuItemId: "m4", qty: 1}]}).data;
  env.call("payOrder", {id: o1.id, method: "CASH", paidAmount: o1.total + 50000});
  const o2 = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data;

  const report = env.call("getReport", {range: "today"}).data;
  assert.equal(report.orderCount, 1, "orderCount hanya transaksi PAID");
  assert.equal(report.totalOrders, 2, "totalOrders tetap menghitung order masuk");
  assert.equal(report.grossSales, 435000);
  assert.equal(report.netSales, o1.total, "order belum dibayar tidak boleh masuk penjualan");
  assert.equal(report.outstandingSales, o2.total);
  assert.equal(report.statusCount.PAID, 1);
  assert.equal(report.statusCount.NEW, 1);
  assert.equal(report.paymentMix.CASH, o1.total);
  assert.ok(report.topItems.some(t => t.name === "Beef Tenderloin" && t.qty === 2));
  assert.ok(!report.topItems.some(t => t.name === "Grilled Salmon"), "item unpaid tidak masuk top items");
  assert.equal(report.series.length, 1);

  const week = env.call("getReport", {range: "7d"}).data;
  assert.equal(week.series.length, 7);
});

test("createOrder idempotent: retry tidak membuat order atau mengurangi stok dua kali", () => {
  const env = bootstrapped();
  const row = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  const stockAwal = Number(row[7]);
  const payload = {clientOrderId: "QR-test-idempotent-001", items: [{menuItemId: "m3", qty: 2}]};

  const first = env.call("createOrder", payload);
  const second = env.call("createOrder", payload);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.id, first.data.id, "retry harus mengembalikan order yang sama");
  assert.equal(env.sheets.get("Orders").rows.length, 2, "hanya ada satu order + header");
  assert.equal(Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]), stockAwal - 2);
});

test("double payment ditolak dan order PAID tidak dapat dibatalkan langsung", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data;
  assert.equal(env.call("payOrder", {id: order.id, method: "QRIS"}).ok, true);
  assert.equal(env.call("payOrder", {id: order.id, method: "CASH", paidAmount: order.total}).ok, false, "pembayaran kedua wajib ditolak");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "CANCELLED", reason: "salah input"}).ok, false, "PAID tidak boleh di-void");
});

test("void/cancel mengembalikan stok tepat satu kali dan membutuhkan alasan", () => {
  const env = bootstrapped();
  const stockAwal = Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]);
  const order = env.call("createOrder", {items: [{menuItemId: "m3", qty: 3}]}).data;
  assert.equal(Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]), stockAwal - 3);
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "CANCELLED"}).ok, false, "alasan wajib");
  const cancelled = env.call("updateOrderStatus", {id: order.id, status: "CANCELLED", reason: "Pelanggan batal"});
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.data.status, "CANCELLED");
  assert.equal(cancelled.data.cancelReason, "Pelanggan batal");
  assert.equal(Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]), stockAwal, "stok kembali");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "CANCELLED", reason: "ulang"}).ok, true, "retry status sama idempotent");
  assert.equal(Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]), stockAwal, "stok tidak boleh kembali dua kali");
});

test("refund hanya dari PAID, full refund tercatat dan dapat restock", () => {
  const env = bootstrapped();
  const stockAwal = Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]);
  const order = env.call("createOrder", {phone: "0812345", customerName: "Diky", items: [{menuItemId: "m3", qty: 2}]}).data;
  assert.equal(env.call("refundOrder", {id: order.id, reason: "belum bayar"}).ok, false);
  const paid = env.call("payOrder", {id: order.id, method: "QRIS"});
  assert.equal(paid.ok, true);
  const customerPaid = env.call("getCustomers", {}).data.find(c => c.phone === "0812345");
  assert.equal(customerPaid.visits, 1);
  assert.equal(customerPaid.totalSpend, paid.data.total);

  const refunded = env.call("refundOrder", {id: order.id, reason: "Pesanan dikembalikan", restock: true});
  assert.equal(refunded.ok, true);
  assert.equal(refunded.data.status, "REFUNDED");
  assert.equal(refunded.data.refundedAmount, paid.data.total);
  assert.equal(refunded.data.refundReason, "Pesanan dikembalikan");
  assert.equal(Number(env.sheets.get("Menu").rows.find(r => r[0] === "m3")[7]), stockAwal);
  assert.equal(env.call("refundOrder", {id: order.id, reason: "ulang", restock: true}).ok, false, "refund kedua ditolak");
  const customerRefund = env.call("getCustomers", {}).data.find(c => c.phone === "0812345");
  assert.equal(customerRefund.visits, 0);
  assert.equal(customerRefund.totalSpend, 0);

  const report = env.call("getReport", {range: "today"}).data;
  assert.equal(report.orderCount, 0, "refund tidak dihitung sebagai penjualan aktif");
  assert.equal(report.refundCount, 1);
  assert.equal(report.refundedSales, paid.data.total);
});

test("deleteData mematuhi whitelist", () => {
  const env = bootstrapped();
  assert.equal(env.call("deleteData", {sheet: "Orders", id: "ORD-1"}).ok, false, "Orders tidak boleh dihapus");
  assert.equal(env.call("deleteData", {sheet: "Menu", id: "m9"}).ok, true);
  assert.equal(env.call("deleteData", {sheet: "Menu", id: "m9"}).ok, false, "id yang sama sudah tidak ada");
});

test("saveTable menormalisasi kode & status", () => {
  const env = bootstrapped();
  const saved = env.call("saveTable", {code: " Meja Baru! ", seats: 6});
  assert.equal(saved.ok, true);
  assert.equal(saved.data.code, "meja-baru");
  assert.equal(saved.data.status, "AVAILABLE");
  assert.equal(env.call("saveTable", {code: "   "}).ok, false, "kode wajib");
});

test("getStaff menyembunyikan pinHash", () => {
  const env = bootstrapped();
  env.sheets.get("Staff").rows.push(["s1", "store-001", "Ayu", "Manager", "pin-hash", true, "2026-01-01"]);
  const staff = env.call("getStaff", {}).data;
  assert.equal(staff.length, 1);
  assert.equal("pinHash" in staff[0], false);
});

test("saveStaff: tambah, PIN ter-hash, update PIN lama dipertahankan", () => {
  const env = bootstrapped();

  const created = env.call("saveStaff", {name: "Rizky", role: "Kasir", pin: "1234", active: true});
  assert.equal(created.ok, true);
  assert.ok(created.data.id, "staff baru mendapat id");
  const savedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.match(String(savedRow[4]), /^sha256\$/, "PIN harus tersimpan sebagai hash");
  assert.equal(savedRow.includes("1234"), false, "PIN polos tidak boleh tersimpan");
  const hashLama = String(savedRow[4]); // snapshot: baris sheet adalah referensi yang termutasi

  const bad = env.call("saveStaff", {name: "Salah", pin: "12ab"});
  assert.equal(bad.ok, false, "PIN non-digit ditolak");
  assert.equal(env.call("saveStaff", {name: "Salah", pin: "12"}).ok, false, "PIN terlalu pendek ditolak");
  assert.equal(env.call("saveStaff", {name: ""}).ok, false, "nama wajib");

  const updated = env.call("saveStaff", {id: created.data.id, name: "Rizky P.", role: "Manager"});
  assert.equal(updated.ok, true);
  const updatedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.equal(updatedRow[3], "Manager");
  assert.equal(String(updatedRow[4]), hashLama, "PIN lama dipertahankan saat tidak diisi");

  const replaced = env.call("saveStaff", {id: created.data.id, name: "Rizky P.", role: "Manager", pin: "567890"});
  const replacedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.notEqual(String(replacedRow[4]), hashLama, "PIN baru menggantikan hash lama");
  assert.equal(replaced.data.name, "Rizky P.");
});

test("getOrders withItems menyertakan item", () => {
  const env = bootstrapped();
  env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}, {menuItemId: "m2", qty: 2}]});
  const orders = env.call("getOrders", {withItems: true}).data;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].items.length, 2);
});


test("staff login PIN aman: list tidak bocorkan hash dan PIN diverifikasi", () => {
  const env = bootstrapped();
  const saved = env.call("saveStaff", {storeId:"store-001", name:"Rina", role:"Kasir", pin:"2468", active:true}).data;
  const list = env.call("listStaffForLogin", {}).data;
  const option = list.find(s => s.id === saved.id);
  assert.ok(option);
  assert.equal("pinHash" in option, false);
  assert.equal(env.call("verifyStaffPin", {staffId:saved.id, pin:"0000"}).ok, false);
  const verified = env.call("verifyStaffPin", {staffId:saved.id, pin:"2468"}).data;
  assert.equal(verified.name, "Rina");
  assert.equal(verified.role, "cashier");
});

test("shift wajib untuk transaksi POS staff dan order mencatat staff/register/shift", () => {
  const env = bootstrapped();
  const staff = env.call("saveStaff", {storeId:"store-001", name:"Dewi", role:"Kasir", pin:"1234", active:true}).data;
  const actor = {_actorId:staff.id, _actorName:"Dewi", _actorRole:"cashier", _actorStoreId:"store-001"};

  const blocked = env.call("createOrder", {...actor, channel:"POS", items:[{menuItemId:"m2", qty:1}]});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Shift belum dibuka/);

  const shift = env.call("openShift", {...actor, openingCash:100000, registerId:"REG-02"}).data;
  assert.equal(shift.status, "OPEN");
  assert.equal(shift.openingCash, 100000);
  assert.equal(env.call("openShift", {...actor, openingCash:0}).ok, false, "tidak boleh dua shift aktif");

  const order = env.call("createOrder", {...actor, _admin:true, channel:"POS", items:[{menuItemId:"m2", qty:1}]}).data;
  assert.equal(order.staffId, staff.id);
  assert.equal(order.staffName, "Dewi");
  assert.equal(order.shiftId, shift.id);
  assert.equal(order.registerId, "REG-02");

  const paid = env.call("payOrder", {...actor, id:order.id, method:"CASH", paidAmount:order.total}).data;
  assert.equal(paid.status, "PAID");
  assert.equal(paid.shiftId, shift.id);

  const closed = env.call("closeShift", {...actor, closingCash:100000 + order.total}).data;
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.cashSales, order.total);
  assert.equal(closed.expectedCash, 100000 + order.total);
  assert.equal(closed.difference, 0);
  assert.equal(env.call("getCurrentShift", actor).data, null);
});

test("refund tunai tercermin pada rekonsiliasi shift", () => {
  const env = bootstrapped();
  const staff = env.call("saveStaff", {storeId:"store-001", name:"Maya", role:"Manager", pin:"9876", active:true}).data;
  const actor = {_actorId:staff.id, _actorName:"Maya", _actorRole:"manager", _actorStoreId:"store-001"};
  const shift = env.call("openShift", {...actor, openingCash:50000, registerId:"REG-01"}).data;
  const order = env.call("createOrder", {...actor, _admin:true, channel:"POS", items:[{menuItemId:"m3", qty:1}]}).data;
  env.call("payOrder", {...actor, id:order.id, method:"CASH", paidAmount:order.total});
  env.call("refundOrder", {...actor, id:order.id, reason:"retur", restock:false});
  const closed = env.call("closeShift", {...actor, closingCash:50000}).data;
  assert.equal(closed.cashSales, order.total);
  assert.equal(closed.cashRefunds, order.total);
  assert.equal(closed.expectedCash, 50000);
  assert.equal(closed.difference, 0);
  assert.equal(closed.id, shift.id);
});


test("Stage 3: recipe/BOM mengurangi bahan, menyimpan cost snapshot, dan cancel mengembalikan bahan", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Tepung", unit:"kg", stock:10, parLevel:2, cost:20000}).data;
  const recipe = env.call("saveRecipe", {menuItemId:"m2", items:[{inventoryId:bahan.id, qty:0.25}]});
  assert.equal(recipe.ok, true);
  assert.equal(recipe.data.length, 1);

  const menu = env.call("getMenu", {}).data.find(m => m.id === "m2");
  assert.equal(menu.cost, 5000, "modal menu harus mengikuti biaya resep");

  const order = env.call("createOrder", {clientOrderId:"recipe-1", items:[{menuItemId:"m2", qty:2}]}).data;
  assert.equal(order.items[0].cost, 5000, "cost snapshot tersimpan di OrderItems");
  assert.equal(env.call("getInventory", {}).data.find(i => i.id === bahan.id).stock, 9.5);
  const saleMove = env.call("getStockMovements", {inventoryId:bahan.id}).data.find(m => m.type === "SALE");
  assert.equal(saleMove.qty, -0.5);
  assert.equal(saleMove.referenceId, order.id);

  const cancelled = env.call("updateOrderStatus", {id:order.id, status:"CANCELLED", reason:"salah pesan"});
  assert.equal(cancelled.ok, true);
  assert.equal(env.call("getInventory", {}).data.find(i => i.id === bahan.id).stock, 10);
  const returnMove = env.call("getStockMovements", {inventoryId:bahan.id}).data.find(m => m.type === "RETURN");
  assert.equal(returnMove.qty, 0.5);
});

test("Stage 3: stok bahan resep yang tidak cukup menolak order sebelum stok berubah", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Keju", unit:"kg", stock:0.2, parLevel:0.1, cost:100000}).data;
  env.call("saveRecipe", {menuItemId:"m8", items:[{inventoryId:bahan.id, qty:0.15}]});
  const menuBefore = env.call("getMenu", {}).data.find(m => m.id === "m8").stock;
  const rejected = env.call("createOrder", {items:[{menuItemId:"m8", qty:2}]});
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /Stok bahan tidak cukup/);
  assert.equal(env.call("getInventory", {}).data.find(i => i.id === bahan.id).stock, 0.2);
  assert.equal(env.call("getMenu", {}).data.find(m => m.id === "m8").stock, menuBefore);
});

test("Stage 3: purchase DRAFT tidak mengubah stok, RECEIVE restock dan weighted average cost", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Kopi", unit:"kg", stock:10, parLevel:2, cost:100000}).data;
  const supplier = env.call("saveSupplier", {name:"PT Kopi Makmur", phone:"0812-xx", active:true}).data;
  const po = env.call("createPurchase", {supplierId:supplier.id, invoiceNo:"INV-001", items:[{inventoryId:bahan.id, qty:10, unitCost:200000}]}).data;
  assert.equal(po.status, "DRAFT");
  assert.equal(po.total, 2000000);
  assert.equal(env.call("getInventory", {}).data.find(i => i.id === bahan.id).stock, 10, "draft belum menambah stok");

  const received = env.call("receivePurchase", {id:po.id}).data;
  assert.equal(received.status, "RECEIVED");
  const after = env.call("getInventory", {}).data.find(i => i.id === bahan.id);
  assert.equal(after.stock, 20);
  assert.equal(after.cost, 150000, "weighted average 10@100k + 10@200k");
  assert.equal(env.call("receivePurchase", {id:po.id}).ok, false, "receive kedua harus ditolak");
  assert.equal(env.call("cancelPurchase", {id:po.id, reason:"x"}).ok, false, "received tidak boleh dicancel");
  const move = env.call("getStockMovements", {inventoryId:bahan.id, type:"PURCHASE"}).data[0];
  assert.equal(move.qty, 10);
  assert.equal(move.unitCost, 200000);
});

test("Stage 3: purchase DRAFT dapat dibatalkan tanpa mengubah stok", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Susu", unit:"liter", stock:5, parLevel:1, cost:15000}).data;
  const supplier = env.call("saveSupplier", {name:"Supplier Susu"}).data;
  const po = env.call("createPurchase", {supplierId:supplier.id, items:[{inventoryId:bahan.id, qty:5, unitCost:16000}]}).data;
  const cancelled = env.call("cancelPurchase", {id:po.id, reason:"vendor batal"}).data;
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(env.call("getInventory", {}).data.find(i => i.id === bahan.id).stock, 5);
  assert.equal(env.call("receivePurchase", {id:po.id}).ok, false);
});

test("Stage 3: opname, waste, dan adjustment tercatat ke stock movement", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Telur", unit:"pcs", stock:100, parLevel:20, cost:2500}).data;
  assert.equal(env.call("adjustInventory", {id:bahan.id, type:"OPNAME", countedStock:95, reason:"Hitung fisik"}).data.stock, 95);
  assert.equal(env.call("adjustInventory", {id:bahan.id, type:"WASTE", qty:5, reason:"Pecah"}).data.stock, 90);
  assert.equal(env.call("adjustInventory", {id:bahan.id, type:"ADJUSTMENT", delta:10, reason:"Koreksi penerimaan"}).data.stock, 100);
  assert.equal(env.call("adjustInventory", {id:bahan.id, type:"WASTE", qty:999, reason:"invalid"}).ok, false);
  const types = env.call("getStockMovements", {inventoryId:bahan.id}).data.map(m => m.type);
  assert.ok(types.includes("OPNAME"));
  assert.ok(types.includes("WASTE"));
  assert.ok(types.includes("ADJUSTMENT"));
});

test("Stage 3: laporan menghitung COGS dan gross profit dari cost snapshot", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Bahan A", unit:"pcs", stock:50, parLevel:5, cost:10000}).data;
  env.call("saveRecipe", {menuItemId:"m6", items:[{inventoryId:bahan.id, qty:2}]});
  const order = env.call("createOrder", {items:[{menuItemId:"m6", qty:3}]}).data;
  env.call("payOrder", {id:order.id, method:"QRIS"});
  // Ubah harga bahan setelah transaksi: report tetap memakai snapshot order item.
  env.call("saveInventory", {id:bahan.id, name:"Bahan A", unit:"pcs", stock:44, parLevel:5, cost:99999});
  const report = env.call("getReport", {range:"today"}).data;
  assert.equal(report.cogs, 60000); // 2 * 10k * 3
  assert.equal(report.grossProfit, report.grossSales - report.discount - report.cogs);
  assert.ok(report.grossMargin > 0);
});


test("Stage 3: bahan yang masih dipakai Recipe/BOM tidak dapat dihapus", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Gula", unit:"kg", stock:5, parLevel:1, cost:18000}).data;
  env.call("saveRecipe", {menuItemId:"m6", items:[{inventoryId:bahan.id, qty:0.05}]});
  const removed = env.call("deleteData", {sheet:"Inventory", id:bahan.id});
  assert.equal(removed.ok, false);
  assert.match(removed.error, /Recipe\/BOM/);
  env.call("saveRecipe", {menuItemId:"m6", items:[]});
  assert.equal(env.call("deleteData", {sheet:"Inventory", id:bahan.id}).ok, true);
});

test("Stage 4 barcode menu dinormalisasi dan unik per store", () => {
  const env = bootstrapped();
  const first = env.call("saveMenu", {name: "Produk Barcode A", price: 10000, barcode: " 899-abc 001 ", storeId: "store-001"});
  assert.equal(first.ok, true);
  assert.equal(first.data.barcode, "899-ABC001");
  const menu = env.call("getMenu", {}).data.find(m => m.id === first.data.id);
  assert.equal(menu.barcode, "899-ABC001");

  const duplicate = env.call("saveMenu", {name: "Produk Barcode B", price: 12000, barcode: "899-abc001", storeId: "store-001"});
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /Barcode sudah dipakai/i);

  const updateSame = env.call("saveMenu", {id: first.data.id, name: "Produk Barcode A Edit", price: 11000, barcode: "899-ABC001", storeId: "store-001"});
  assert.equal(updateSame.ok, true, "menu boleh mempertahankan barcode miliknya sendiri");
});


test("Stage 5: promo persen dihitung server-side dan manual diskon persen tidak percaya total client", () => {
  const env = bootstrapped();
  const promo = env.call("savePromotion", {storeId:"store-001", name:"Hemat 10%", type:"PERCENT", value:10, minSpend:10000, active:true}).data;
  const order = env.call("createOrder", {_admin:true, promoId:promo.id, manualDiscountType:"PERCENT", manualDiscountValue:5, discount:99999999, items:[{menuItemId:"m6", qty:1}]}).data;
  assert.equal(order.subtotal, 48000);
  assert.equal(order.manualDiscount, 2400);
  assert.equal(order.promoDiscount, 4800);
  assert.equal(order.discount, 7200);
  assert.equal(order.total, 43200, "48k - 7.2k + service 2.4k");
});

test("Stage 5: voucher memiliki kuota, dipakai saat order, dan kuota kembali saat order dibatalkan", () => {
  const env = bootstrapped();
  const voucher = env.call("saveVoucher", {storeId:"store-001", code:"HEMAT10K", name:"Hemat 10K", type:"FIXED", value:10000, usageLimit:1, active:true}).data;
  const order = env.call("createOrder", {voucherCode:"hemat10k", items:[{menuItemId:"m4", qty:1}]}).data;
  assert.equal(order.voucherCode, "HEMAT10K");
  assert.equal(order.voucherDiscount, 10000);
  assert.equal(env.call("getVouchers", {storeId:"store-001"}).data.find(v=>v.id===voucher.id).usedCount, 1);
  assert.equal(env.call("createOrder", {voucherCode:"HEMAT10K", items:[{menuItemId:"m4", qty:1}]}).ok, false, "kuota habis harus ditolak");
  assert.equal(env.call("updateOrderStatus", {id:order.id, status:"CANCELLED", reason:"customer batal"}).ok, true);
  assert.equal(env.call("getVouchers", {storeId:"store-001"}).data.find(v=>v.id===voucher.id).usedCount, 0);
  assert.equal(env.call("createOrder", {voucherCode:"HEMAT10K", items:[{menuItemId:"m4", qty:1}]}).ok, true, "voucher bisa dipakai lagi setelah cancel");
});

test("Stage 5: loyalty redeem, earn saat paid, dan refund mengembalikan saldo secara konsisten", () => {
  const env = bootstrapped();
  const member = env.call("saveCustomer", {storeId:"store-001", name:"Member Satu", phone:"081234567890", tier:"GOLD", points:100, lifetimePoints:100}).data;
  const found = env.call("findCustomer", {storeId:"store-001", phone:"0812-3456-7890"}).data;
  assert.equal(found.id, member.id);
  assert.ok(found.memberCode);

  const order = env.call("createOrder", {_admin:true, phone:"081234567890", pointsToRedeem:10, items:[{menuItemId:"m1", qty:1}]}).data;
  assert.equal(order.pointsRedeemed, 10);
  assert.equal(order.pointsDiscount, 1000);
  assert.equal(env.call("findCustomer", {storeId:"store-001", phone:"081234567890"}).data.points, 90);

  const paid = env.call("payOrder", {id:order.id, method:"QRIS"}).data;
  assert.equal(paid.pointsEarned, Math.floor(paid.total / 10000));
  const afterPaid = env.call("findCustomer", {storeId:"store-001", phone:"081234567890"}).data;
  assert.equal(afterPaid.points, 90 + paid.pointsEarned);

  assert.equal(env.call("refundOrder", {id:order.id, reason:"refund penuh", restock:false}).ok, true);
  const afterRefund = env.call("findCustomer", {storeId:"store-001", phone:"081234567890"}).data;
  assert.equal(afterRefund.points, 100, "redeem dikembalikan dan poin hasil transaksi dibalik");
  const txnTypes = env.call("getLoyaltyTransactions", {customerId:member.id}).data.map(t=>t.type);
  assert.ok(txnTypes.includes("REDEEM"));
  assert.ok(txnTypes.includes("EARN"));
  assert.ok(txnTypes.includes("REVERSE_EARN"));
  assert.ok(txnTypes.includes("RESTORE_REDEEM"));
});

test("Stage 5: split payment menyimpan setiap metode dan laporan merekonsiliasi nominal per metode", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items:[{menuItemId:"m4", qty:1}]}).data;
  const cash = 30000;
  const qris = order.total - cash;
  const paid = env.call("payOrder", {id:order.id, payments:[
    {method:"CASH", amount:cash, receivedAmount:50000},
    {method:"QRIS", amount:qris}
  ]}).data;
  assert.equal(paid.paymentMethod, "SPLIT");
  assert.equal(paid.payments.length, 2);
  assert.equal(paid.changeAmount, 20000);
  assert.equal(env.sheets.get("Payments").rows.length, 3, "header + dua payment allocation");
  const report = env.call("getReport", {range:"today"}).data;
  assert.equal(report.paymentMix.CASH, cash);
  assert.equal(report.paymentMix.QRIS, qris);
});

test("Stage 5: split bill memindahkan item tanpa mengurangi stok dua kali dan snapshot BOM mengikuti order baru", () => {
  const env = bootstrapped();
  const bahan = env.call("saveInventory", {name:"Sirup Split", unit:"ml", stock:1000, parLevel:100, cost:20}).data;
  env.call("saveRecipe", {menuItemId:"m6", items:[{inventoryId:bahan.id, qty:50}]});
  const startStock = env.call("getInventory", {}).data.find(i=>i.id===bahan.id).stock;
  const order = env.call("createOrder", {items:[{menuItemId:"m6", qty:2}]}).data;
  assert.equal(env.call("getInventory", {}).data.find(i=>i.id===bahan.id).stock, startStock - 100);
  const itemId = env.call("getOrder", {id:order.id}).data.items[0].id;
  const split = env.call("splitOrder", {id:order.id, items:[{orderItemId:itemId, qty:1}]}).data;
  assert.equal(split.original.items[0].qty, 1);
  assert.equal(split.split.items[0].qty, 1);
  assert.equal(env.call("getInventory", {}).data.find(i=>i.id===bahan.id).stock, startStock - 100, "split tidak boleh mengurangi stok lagi");

  const usages = env.sheets.get("OrderIngredientUsage").rows.slice(1);
  const header = env.sheets.get("OrderIngredientUsage").rows[0];
  const idxOrder = header.indexOf("orderId"), idxQty = header.indexOf("qty");
  const originalUsage = usages.filter(r=>r[idxOrder]===order.id).reduce((a,r)=>a+Number(r[idxQty]||0),0);
  const splitUsage = usages.filter(r=>r[idxOrder]===split.split.id).reduce((a,r)=>a+Number(r[idxQty]||0),0);
  assert.equal(originalUsage, 50);
  assert.equal(splitUsage, 50);

  assert.equal(env.call("updateOrderStatus", {id:split.split.id, status:"CANCELLED", reason:"split batal"}).ok, true);
  assert.equal(env.call("getInventory", {}).data.find(i=>i.id===bahan.id).stock, startStock - 50, "hanya bahan milik split child yang direstore");
  assert.equal(env.call("updateOrderStatus", {id:order.id, status:"CANCELLED", reason:"sisa batal"}).ok, true);
  assert.equal(env.call("getInventory", {}).data.find(i=>i.id===bahan.id).stock, startStock, "cancel kedua order memulihkan stok penuh tepat sekali");
});


test("Stage 6: subscription trial aktif dan membatasi jumlah outlet", () => {
  const env = bootstrapped();
  const sub = env.call("getSubscription", {}).data;
  assert.equal(sub.status, "TRIAL");
  assert.equal(sub.maxOutlets, 2);
  assert.equal(sub.isActive, true);

  const second = env.call("saveStore", {_actorRole:"admin", _actorId:"owner", name:"Outlet Dua", slug:"outlet-dua"});
  assert.equal(second.ok, true);
  const third = env.call("saveStore", {_actorRole:"admin", _actorId:"owner", name:"Outlet Tiga", slug:"outlet-tiga"});
  assert.equal(third.ok, false);
  assert.match(third.error, /Batas outlet/i);
});



test("Stage 6: subscription expired memblokir mutasi tetapi read/backup tetap tersedia", () => {
  const env = bootstrapped();
  const sheet = env.sheets.get("Subscriptions");
  const header = sheet.rows[0];
  const row = sheet.rows[1];
  row[header.indexOf("trialEnd")] = new Date(Date.now()-86400000).toISOString();
  row[header.indexOf("activeUntil")] = "";
  row[header.indexOf("status")] = "TRIAL";

  const sub = env.call("getSubscription", {}).data;
  assert.equal(sub.status, "EXPIRED");
  assert.equal(sub.isActive, false);
  const blocked = env.call("createOrder", {storeId:"store-001", items:[{menuItemId:"m4",qty:1}]});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /langganan.*berakhir/i);
  assert.equal(env.call("getMenu", {storeId:"store-001"}).ok, true);
  assert.equal(env.call("exportBackup", {_actorRole:"admin", storeId:"store-001"}).ok, true);
});
test("Stage 6: lisensi aktif menaikkan batas outlet", () => {
  const env = bootstrapped();
  const install = env.call("getSubscription", {}).data.installationId;
  const applied = env.call("applySubscription", {_actorRole:"admin", _actorId:"owner", _licenseVerified:true, installationId:install, plan:"PRO", activeUntil:new Date(Date.now()+365*86400000).toISOString(), maxOutlets:5, licenseId:"LIC-UJI"});
  assert.equal(applied.ok, true);
  assert.equal(applied.data.status, "ACTIVE");
  assert.equal(applied.data.maxOutlets, 5);
  assert.equal(env.call("saveStore", {_actorRole:"admin", name:"Outlet Dua", slug:"outlet-dua"}).ok, true);
  assert.equal(env.call("saveStore", {_actorRole:"admin", name:"Outlet Tiga", slug:"outlet-tiga"}).ok, true);
});



test("Stage 6: lisensi terikat pada Installation ID", () => {
  const env = bootstrapped();
  const denied = env.call("applySubscription", {_actorRole:"admin", _licenseVerified:true, installationId:"INST-SALAH", plan:"PRO", activeUntil:new Date(Date.now()+86400000).toISOString(), maxOutlets:3, licenseId:"LIC-SALAH"});
  assert.equal(denied.ok, false);
  assert.match(denied.error, /instalasi yang berbeda/i);
});
test("Stage 6: report dan menu terisolasi per outlet", () => {
  const env = bootstrapped();
  const store2 = env.call("saveStore", {_actorRole:"admin", name:"Cabang Bandung", slug:"bandung"}).data;
  const menu2 = env.call("saveMenu", {_actorRole:"admin", storeId:store2.id, name:"Kopi Cabang", price:25000, stock:10, active:true}).data;

  const order1 = env.call("createOrder", {storeId:"store-001", items:[{menuItemId:"m4", qty:1}]}).data;
  env.call("payOrder", {id:order1.id, method:"QRIS"});
  const order2 = env.call("createOrder", {storeId:store2.id, items:[{menuItemId:menu2.id, qty:1}]}).data;
  env.call("payOrder", {id:order2.id, method:"QRIS"});

  const r1 = env.call("getReport", {storeId:"store-001", range:"today"}).data;
  const r2 = env.call("getReport", {storeId:store2.id, range:"today"}).data;
  assert.equal(r1.orderCount, 1);
  assert.equal(r2.orderCount, 1);
  assert.notEqual(r1.netSales, r2.netSales);
  const menuBandung = env.call("getMenu", {storeId:"bandung"}).data;
  assert.deepEqual(menuBandung.map(m=>m.id), [menu2.id]);
});

test("Stage 6: manager tidak dapat membaca order outlet lain", () => {
  const env = bootstrapped();
  const store2 = env.call("saveStore", {_actorRole:"admin", name:"Cabang Dua", slug:"cabang-dua"}).data;
  const menu2 = env.call("saveMenu", {_actorRole:"admin", storeId:store2.id, name:"Produk Cabang", price:15000, stock:5}).data;
  const order2 = env.call("createOrder", {storeId:store2.id, items:[{menuItemId:menu2.id, qty:1}]}).data;
  const denied = env.call("getOrder", {id:order2.id, _actorRole:"manager", _actorStoreId:"store-001"});
  assert.equal(denied.ok, false);
  assert.match(denied.error, /outlet lain/i);
  const list = env.call("getOrders", {_actorRole:"manager", _actorStoreId:"store-001"}).data;
  assert.ok(list.every(o=>o.storeId === "store-001"));
});

test("Stage 6: Owner Dashboard mengagregasi outlet tanpa mencampur laporan outlet", () => {
  const env = bootstrapped();
  const store2 = env.call("saveStore", {_actorRole:"admin", name:"Cabang Owner", slug:"owner-2"}).data;
  const menu2 = env.call("saveMenu", {_actorRole:"admin", storeId:store2.id, name:"Menu Owner", price:30000, stock:10}).data;
  const a = env.call("createOrder", {storeId:"store-001", items:[{menuItemId:"m4",qty:1}]}).data; env.call("payOrder",{id:a.id,method:"QRIS"});
  const b = env.call("createOrder", {storeId:store2.id, items:[{menuItemId:menu2.id,qty:2}]}).data; env.call("payOrder",{id:b.id,method:"QRIS"});
  const owner = env.call("getOwnerDashboard", {_actorRole:"admin", range:"today"}).data;
  assert.equal(owner.outlets.length, 2);
  assert.equal(owner.totals.orders, 2);
  assert.equal(owner.totals.netSales, owner.outlets.reduce((sum,o)=>sum+Number(o.netSales||0),0));
});

test("Stage 6: backup hanya membawa data outlet terpilih", () => {
  const env = bootstrapped();
  const store2 = env.call("saveStore", {_actorRole:"admin", name:"Cabang Backup", slug:"backup-2"}).data;
  const menu2 = env.call("saveMenu", {_actorRole:"admin", storeId:store2.id, name:"Menu Backup", price:17000}).data;
  const backup = env.call("exportBackup", {_actorRole:"admin", storeId:store2.id}).data;
  assert.equal(backup.format, "KASTRIVA_POS_BACKUP_V1");
  assert.equal(backup.store.id, store2.id);
  assert.ok(backup.checksum.startsWith("sha256:"));
  assert.ok(backup.data.Menu.some(m=>m.id===menu2.id));
  assert.ok(backup.data.Menu.every(m=>m.storeId===store2.id));
});

test("Stage 6: analytics menghitung customer repeat dan channel per outlet", () => {
  const env = bootstrapped();
  for (let i=0;i<2;i++) {
    const order = env.call("createOrder", {storeId:"store-001", phone:"08123456789", channel:"POS", items:[{menuItemId:"m4",qty:1}]}).data;
    env.call("payOrder", {id:order.id, method:"QRIS"});
  }
  const data = env.call("getAnalytics", {storeId:"store-001", days:30}).data;
  assert.equal(data.paidOrders, 2);
  assert.equal(data.uniqueCustomers, 1);
  assert.equal(data.repeatCustomers, 1);
  assert.equal(data.repeatRate, 100);
  assert.ok(data.channel.some(x=>x.label==="POS" && x.value>0));
});

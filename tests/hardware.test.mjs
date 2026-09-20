import test from "node:test";
import assert from "node:assert/strict";
import {buildKitchenText, buildReceiptText, normalizeScannedBarcode} from "../lib/hardware.ts";

const order = {
  id: "ORD-TEST-1", storeId: "store-001", tableId: "", tableCode: "A1", customerName: "Budi", phone: "",
  channel: "POS", status: "PAID", subtotal: 30000, discount: 2000, tax: 3000, service: 0, total: 31000,
  note: "Tanpa pedas", createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z",
  paymentMethod: "CASH", paidAmount: 50000, changeAmount: 19000, staffName: "Rina", registerId: "POS-01",
  items: [{id:"oi1", orderId:"ORD-TEST-1", menuItemId:"m1", name:"Nasi Goreng", price:15000, qty:2, note:"1 tanpa telur"}]
};

test("Stage 4 normalisasi barcode scanner", () => {
  assert.equal(normalizeScannedBarcode("  899 123 abc\n"), "899123ABC");
  assert.equal(normalizeScannedBarcode(""), "");
});

test("Stage 4 format receipt ESC/POS berisi data transaksi penting", () => {
  const text = buildReceiptText(order, "Kastriva Test", 58);
  assert.match(text, /Kastriva Test/i);
  assert.match(text, /ORD-TEST-1/);
  assert.match(text, /Nasi Goreng x2/);
  assert.match(text, /TOTAL/);
  assert.match(text, /Kasir: Rina/);
  for (const line of text.trimEnd().split("\n")) assert.ok(line.length <= 32, `baris 58mm terlalu panjang: ${line}`);
});

test("Stage 4 format kitchen ticket tidak memuat nominal pembayaran", () => {
  const text = buildKitchenText(order, 80);
  assert.match(text, /KITCHEN ORD-TEST-1/);
  assert.match(text, /2x Nasi Goreng/);
  assert.match(text, /CATATAN: Tanpa pedas/);
  assert.doesNotMatch(text, /50000|TOTAL|Kembalian/);
  for (const line of text.trimEnd().split("\n")) assert.ok(line.length <= 48, `baris 80mm terlalu panjang: ${line}`);
});

test("Stage 5 receipt menampilkan split payment dan loyalty member", () => {
  const stage5Order = {
    ...order,
    paymentMethod: "SPLIT",
    paymentSummary: JSON.stringify([
      {method:"CASH", amount:10000, receivedAmount:20000, changeAmount:10000},
      {method:"QRIS", amount:21000, receivedAmount:21000, changeAmount:0}
    ]),
    memberCode: "KAS-ABC123",
    pointsEarned: 3
  };
  const text = buildReceiptText(stage5Order, "Kastriva Test", 80);
  assert.match(text, /CASH/i);
  assert.match(text, /QRIS/i);
  assert.match(text, /KAS-ABC123/);
  assert.match(text, /\+3 poin/i);
});

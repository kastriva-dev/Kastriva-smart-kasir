/**
 * Kastriva Smart Kasir - Google Apps Script Backend
 * Database: Google Sheets
 *
 * Setup:
 * 1. Buat Google Spreadsheet baru.
 * 2. Extensions > Apps Script, tempel file ini sebagai Code.gs.
 * 3. Project Settings > Script properties, tambahkan GAS_API_KEY = secret acak
 *    (WAJIB; tanpa properti ini semua request akan ditolak).
 * 4. Jalankan setupDatabase() sekali dan izinkan akses.
 * 5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 6. Simpan URL /exec ke environment Vercel sebagai GAS_WEB_APP_URL,
 *    dan GAS_API_KEY yang sama ke environment Vercel.
 *
 * Catatan keamanan: "Anyone" hanya berarti endpoint dapat diakses;
 * setiap request masih harus menyertakan key yang cocok.
 *
 * Flag `_admin`: hanya boleh disetel oleh proxy Next.js (server), bukan browser.
 * Bila true, payload createOrder boleh membawa `discount`, dan action admin tersedia.
 */

var SHEETS = {
  STORES: 'Stores',
  TABLES: 'Tables',
  CATEGORIES: 'Categories',
  MENU: 'Menu',
  ORDERS: 'Orders',
  ORDER_ITEMS: 'OrderItems',
  ORDER_INGREDIENT_USAGE: 'OrderIngredientUsage',
  CUSTOMERS: 'Customers',
  RESERVATIONS: 'Reservations',
  INVENTORY: 'Inventory',
  PROMOTIONS: 'Promotions',
  VOUCHERS: 'Vouchers',
  PAYMENTS: 'Payments',
  LOYALTY_TRANSACTIONS: 'LoyaltyTransactions',
  SUPPLIERS: 'Suppliers',
  PURCHASES: 'Purchases',
  PURCHASE_ITEMS: 'PurchaseItems',
  RECIPES: 'Recipes',
  STOCK_MOVEMENTS: 'StockMovements',
  STAFF: 'Staff',
  SHIFTS: 'Shifts',
  AUDIT: 'AuditLog',
  SUBSCRIPTIONS: 'Subscriptions',
  SETTINGS: 'Settings'
};

// Kolom baru Orders selalu ditambahkan di belakang agar database lama tetap kompatibel.
// setupDatabase() dan ensureHeaders_() menambahkan header yang belum ada tanpa menghapus data.
var HEADERS = {
  Stores: ['id','name','slug','phone','address','taxRate','serviceRate','createdAt','loyaltyEnabled','loyaltySpendPerPoint','loyaltyPointValue','maxRedeemPercent','active'],
  Tables: ['id','storeId','code','seats','status','createdAt'],
  Categories: ['id','storeId','name','sortOrder','active'],
  Menu: ['id','storeId','categoryId','name','description','price','cost','stock','active','emoji','imageUrl','createdAt','updatedAt','barcode'],
  Orders: ['id','storeId','tableId','tableCode','customerName','phone','channel','status','subtotal','discount','tax','service','total','note','createdAt','updatedAt','paymentMethod','paidAmount','changeAmount','clientOrderId','cancelReason','cancelledAt','refundedAmount','refundReason','refundedAt','staffId','staffName','shiftId','registerId','manualDiscount','discountType','discountValue','promoId','promoName','promoDiscount','voucherCode','voucherDiscount','memberId','memberCode','pointsRedeemed','pointsDiscount','pointsEarned','paymentSummary','splitFromOrderId'],
  OrderItems: ['id','orderId','menuItemId','name','price','qty','note','cost'],
  OrderIngredientUsage: ['id','orderId','orderItemId','menuItemId','inventoryId','qty','unitCost'],
  Customers: ['id','storeId','name','phone','email','tier','visits','totalSpend','preferences','createdAt','updatedAt','memberCode','points','lifetimePoints','lastVisitAt'],
  Reservations: ['id','storeId','guestName','phone','partySize','reservedAt','status','note','createdAt'],
  Inventory: ['id','storeId','name','unit','stock','parLevel','cost','updatedAt'],
  Promotions: ['id','storeId','name','type','value','minSpend','maxDiscount','startAt','endAt','active','createdAt','updatedAt'],
  Vouchers: ['id','storeId','code','name','type','value','minSpend','maxDiscount','usageLimit','usedCount','startAt','endAt','active','createdAt','updatedAt'],
  Payments: ['id','storeId','orderId','method','amount','receivedAmount','changeAmount','reference','staffId','staffName','shiftId','registerId','createdAt'],
  LoyaltyTransactions: ['id','storeId','customerId','memberCode','orderId','type','points','balanceAfter','note','createdAt'],
  Suppliers: ['id','storeId','name','phone','email','address','note','active','createdAt','updatedAt'],
  Purchases: ['id','storeId','supplierId','supplierName','invoiceNo','status','total','note','createdAt','receivedAt','receivedBy','cancelledAt'],
  PurchaseItems: ['id','purchaseId','inventoryId','inventoryName','qty','unitCost','total'],
  Recipes: ['id','storeId','menuItemId','inventoryId','qty','unit'],
  StockMovements: ['id','storeId','inventoryId','inventoryName','type','qty','beforeStock','afterStock','unitCost','totalCost','referenceType','referenceId','note','staffId','staffName','createdAt'],
  Staff: ['id','storeId','name','role','pinHash','active','createdAt'],
  Shifts: ['id','storeId','staffId','staffName','role','registerId','status','openingCash','openedAt','closingCash','expectedCash','cashSales','cashRefunds','difference','closedAt','note'],
  AuditLog: ['id','storeId','userId','action','entity','entityId','detail','createdAt'],
  Subscriptions: ['id','plan','status','trialStart','trialEnd','activeUntil','maxOutlets','licenseId','updatedAt','installationId'],
  Settings: ['key','value','updatedAt']
};

var ORDER_STATUSES = ['NEW','CONFIRMED','COOKING','READY','SERVED','PAID','CANCELLED','REFUNDED'];
var ORDER_CHANNELS = ['POS','QR','WA'];
var PAYMENT_METHODS = ['CASH','QRIS','DEBIT','EWALLET','TRANSFER'];
var RESERVATION_STATUSES = ['BOOKED','CONFIRMED','SEATED','CANCELLED'];
// Sheet yang boleh dihapus barisnya lewat action deleteData.
var DELETABLE_SHEETS = {Menu: true, Tables: true, Inventory: true, Promotions: true, Vouchers: true, Suppliers: true, Reservations: true, Customers: true, Staff: true};
var LOCK_TIMEOUT_MS = 20000;

/**
 * Membuat semua sheet dan header bila belum ada.
 * Header yang berbeda TIDAK lagi memicu sh.clear() (versi lama menghapus semua data);
 * kolom yang kurang ditambahkan di belakang, kolom asing dibiarkan.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  Object.keys(SHEETS).forEach(function(key) {
    var name = SHEETS[key];
    var headers = HEADERS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(headers);
      report.push(name + ': created');
    } else if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      report.push(name + ': header added');
    } else {
      var width = Math.max(sh.getLastColumn(), 1);
      var current = sh.getRange(1, 1, 1, width).getValues()[0].map(function(v) { return String(v); });
      var missing = headers.filter(function(h) { return current.indexOf(h) === -1; });
      if (missing.length) {
        sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
        report.push(name + ': added columns ' + missing.join(','));
      }
    }
    sh.setFrozenRows(1);
  });
  seedDemoData_();
  ensureSubscription_();
  return report.join(' | ') || 'Database sudah sesuai';
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    auth_(params.key);
    var payload = params.payload ? JSON.parse(params.payload) : {};
    return json_(dispatch_(params.action || 'health', payload));
  } catch (err) {
    return json_(errorPayload_(err));
  }
}

function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    auth_(body.key);
    return json_(dispatch_(body.action || 'health', body.payload || {}));
  } catch (err) {
    return json_(errorPayload_(err));
  }
}

function dispatch_(action, p) {
  p = scopePayloadToActor_(p || {});
  assertSubscriptionForAction_(action);
  switch (action) {
    case 'health':
      return {ok: true, service: 'Kastriva GAS', time: iso_()};
    case 'getMenu':
      return {ok: true, data: listMenuForClient_(p)};
    case 'getSettings':
      return {ok: true, data: getPublicSettings_(p)};
    case 'getStores':
      return {ok: true, data: getStores_(p)};
    case 'getOwnerDashboard':
      return {ok: true, data: getOwnerDashboard_(p)};
    case 'getAnalytics':
      return {ok: true, data: getAdvancedAnalytics_(p)};
    case 'getSyncState':
      return {ok: true, data: getSyncState_(p)};
    case 'exportBackup':
      return {ok: true, data: exportBackup_(p)};
    case 'getSubscription':
      return {ok: true, data: getSubscription_()};
    case 'applySubscription':
      return withLock_(function() { return applySubscription_(p); });
    case 'getOrders':
      return {ok: true, data: listOrders_(p)};
    case 'getOrder':
      return {ok: true, data: getOrderWithItemsScoped_(p)};
    case 'createOrder':
      return withLock_(function() { return createOrder_(p); });
    case 'updateOrderStatus':
      return withLock_(function() { return updateOrderStatus_(p); });
    case 'payOrder':
      return withLock_(function() { return payOrder_(p); });
    case 'refundOrder':
      return withLock_(function() { return refundOrder_(p); });
    case 'splitOrder':
      return withLock_(function() { return splitOrder_(p); });
    case 'getTables':
      return {ok: true, data: scopedList_('Tables', p)};
    case 'getCustomers':
      return {ok: true, data: scopedList_('Customers', p)};
    case 'findCustomer':
      return {ok: true, data: findCustomer_(p)};
    case 'getPromotions':
      return {ok: true, data: getPromotions_(p)};
    case 'getVouchers':
      return {ok: true, data: getVouchers_(p)};
    case 'getLoyaltyTransactions':
      return {ok: true, data: getLoyaltyTransactions_(p)};
    case 'getInventory':
      return {ok: true, data: scopedList_('Inventory', p)};
    case 'getSuppliers':
      return {ok: true, data: scopedList_('Suppliers', p)};
    case 'getPurchases':
      return {ok: true, data: getPurchases_(p)};
    case 'getRecipes':
      return {ok: true, data: getRecipes_(p)};
    case 'getStockMovements':
      return {ok: true, data: getStockMovements_(p)};
    case 'getReservations':
      return {ok: true, data: scopedList_('Reservations', p)};
    case 'getStaff':
      return {ok: true, data: scopedList_('Staff', p).map(stripPin_)};
    case 'listStaffForLogin':
      return {ok: true, data: listStaffForLogin_()};
    case 'verifyStaffPin':
      return {ok: true, data: verifyStaffPin_(p)};
    case 'getShifts':
      return {ok: true, data: getShifts_(p)};
    case 'getCurrentShift':
      return {ok: true, data: getCurrentShift_(p)};
    case 'openShift':
      return withLock_(function() { return openShift_(p); });
    case 'closeShift':
      return withLock_(function() { return closeShift_(p); });
    case 'getCategories':
      return {ok: true, data: scopedList_('Categories', p)};
    case 'getReport':
      return {ok: true, data: getReport_(p)};
    case 'saveMenu':
      return withLock_(function() { return saveMenu_(p); });
    case 'saveCategory':
      return withLock_(function() { return upsertObject_('Categories', normalizeCategory_(p)); });
    case 'saveTable':
      return withLock_(function() { return upsertObject_('Tables', normalizeTable_(p)); });
    case 'saveInventory':
      return withLock_(function() { return saveInventory_(p); });
    case 'savePromotion':
      return withLock_(function() { return savePromotion_(p); });
    case 'saveVoucher':
      return withLock_(function() { return saveVoucher_(p); });
    case 'saveSupplier':
      return withLock_(function() { return upsertObject_('Suppliers', normalizeSupplier_(p)); });
    case 'saveRecipe':
      return withLock_(function() { return saveRecipe_(p); });
    case 'createPurchase':
      return withLock_(function() { return createPurchase_(p); });
    case 'receivePurchase':
      return withLock_(function() { return receivePurchase_(p); });
    case 'cancelPurchase':
      return withLock_(function() { return cancelPurchase_(p); });
    case 'adjustInventory':
      return withLock_(function() { return adjustInventory_(p); });
    case 'saveReservation':
      return withLock_(function() { return upsertObject_('Reservations', normalizeReservation_(p)); });
    case 'saveCustomer':
      return withLock_(function() { return upsertObject_('Customers', normalizeCustomer_(p)); });
    case 'saveStaff':
      return withLock_(function() { return upsertObject_('Staff', normalizeStaff_(p)); });
    case 'saveSettings':
      return withLock_(function() { return saveSettings_(p); });
    case 'saveStore':
      return withLock_(function() { return saveStore_(p); });
    case 'deleteData':
      return withLock_(function() { return deleteData_(p); });
    case 'deleteMenu':
      return withLock_(function() { var q = Object.assign({}, p, {sheet:'Menu'}); return deleteData_(q); });
    case 'audit':
      return withLock_(function() {
        return appendObject_('AuditLog', {
          id: uuid_(),
          storeId: str_(p.storeId, 64),
          userId: actorContext_(p).id || str_(p.userId, 64),
          action: str_(p.action, 32),
          entity: str_(p.entity, 32),
          entityId: str_(p.entityId, 64),
          detail: str_(p.detail, 2000),
          createdAt: iso_()
        });
      });
    default:
      throw new Error('Unknown action: ' + String(action).slice(0, 40));
  }
}


/* ---------------- Promo, Voucher & Loyalty ---------------- */

function loyaltyConfig_(store) {
  store = store || {};
  var enabledRaw = store.loyaltyEnabled;
  var enabled = !(enabledRaw === false || String(enabledRaw).toLowerCase() === 'false' || String(enabledRaw) === '0');
  return {
    enabled: enabled,
    spendPerPoint: Math.max(1, Math.round(Number(store.loyaltySpendPerPoint) || 10000)),
    pointValue: Math.max(1, Math.round(Number(store.loyaltyPointValue) || 100)),
    maxRedeemPercent: Math.min(100, Math.max(0, (store.maxRedeemPercent === '' || store.maxRedeemPercent === undefined || store.maxRedeemPercent === null) ? 30 : Number(store.maxRedeemPercent)))
  };
}

function isWithinPeriod_(row) {
  var now = Date.now();
  var start = row && row.startAt ? Date.parse(String(row.startAt)) : NaN;
  var end = row && row.endAt ? Date.parse(String(row.endAt)) : NaN;
  if (isFinite(start) && now < start) return false;
  if (isFinite(end) && now > end) return false;
  return true;
}

function promotionDiscount_(rule, subtotal) {
  if (!rule || !isActive_(rule) || !isWithinPeriod_(rule)) return 0;
  var minSpend = Math.max(0, Number(rule.minSpend) || 0);
  if (subtotal < minSpend) return 0;
  var type = String(rule.type || '').toUpperCase();
  var value = Math.max(0, Number(rule.value) || 0);
  var amount = type === 'PERCENT' ? Math.round(subtotal * Math.min(value, 100) / 100) : Math.round(value);
  var maxDiscount = Math.max(0, Number(rule.maxDiscount) || 0);
  if (maxDiscount > 0) amount = Math.min(amount, maxDiscount);
  return Math.min(Math.max(0, amount), subtotal);
}

function findVoucherByCode_(code, storeId) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return null;
  var rows = listObjects_('Vouchers');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].code || '').toUpperCase() !== code) continue;
    if (storeId && rows[i].storeId && String(rows[i].storeId) !== String(storeId)) continue;
    return rows[i];
  }
  return null;
}

function validateVoucher_(code, storeId, subtotal) {
  var voucher = findVoucherByCode_(code, storeId);
  if (!voucher) throw new Error('Voucher tidak ditemukan');
  if (!isActive_(voucher)) throw new Error('Voucher tidak aktif');
  if (!isWithinPeriod_(voucher)) throw new Error('Voucher berada di luar periode berlaku');
  var limit = Math.max(0, Math.floor(Number(voucher.usageLimit) || 0));
  var used = Math.max(0, Math.floor(Number(voucher.usedCount) || 0));
  if (limit > 0 && used >= limit) throw new Error('Kuota voucher sudah habis');
  if (subtotal < Math.max(0, Number(voucher.minSpend) || 0)) throw new Error('Minimum belanja voucher belum terpenuhi');
  return voucher;
}

function findCustomerByPhone_(phone, storeId) {
  var normalized = str_(phone, 20).replace(/[^0-9+]/g, '');
  if (!normalized) return null;
  var rows = listObjects_('Customers');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].phone || '') !== normalized) continue;
    if (storeId && rows[i].storeId && String(rows[i].storeId) !== String(storeId)) continue;
    return rows[i];
  }
  return null;
}

function ensureMemberCode_(customer) {
  if (!customer) return null;
  if (!customer.memberCode) {
    customer.memberCode = 'KAS-' + Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
    if (customer.points === '' || customer.points === undefined) customer.points = 0;
    if (customer.lifetimePoints === '' || customer.lifetimePoints === undefined) customer.lifetimePoints = 0;
    var row = findRow_('Customers', customer.id);
    if (row) updateRow_('Customers', row, customer);
  }
  return customer;
}

function calculateOrderDiscounts_(p, store, subtotal, trusted) {
  var manualType = String(str_(p.manualDiscountType, 12) || 'FIXED').toUpperCase();
  if (manualType !== 'PERCENT') manualType = 'FIXED';
  var rawManualValue = p.manualDiscountValue !== undefined ? Number(p.manualDiscountValue) : Number(p.discount);
  if (!isFinite(rawManualValue)) rawManualValue = 0;
  rawManualValue = Math.max(0, rawManualValue);
  var manualDiscount = 0;
  if (trusted) {
    manualDiscount = manualType === 'PERCENT'
      ? Math.round(subtotal * Math.min(rawManualValue, 100) / 100)
      : Math.round(rawManualValue);
  }
  manualDiscount = Math.min(subtotal, manualDiscount);

  var promoId = trusted ? str_(p.promoId, 64) : '';
  var promo = promoId ? getObject_('Promotions', promoId) : null;
  var promoDiscount = 0;
  if (promoId) {
    if (!promo || (promo.storeId && String(promo.storeId) !== String(store.id))) throw new Error('Promo tidak ditemukan');
    promoDiscount = promotionDiscount_(promo, subtotal);
    if (promoDiscount <= 0) throw new Error('Promo tidak aktif atau minimum belanja belum terpenuhi');
  }

  var voucherCode = str_(p.voucherCode, 40).toUpperCase();
  var voucher = voucherCode ? validateVoucher_(voucherCode, store.id, subtotal) : null;
  var voucherDiscount = voucher ? promotionDiscount_(voucher, subtotal) : 0;

  var beforePoints = Math.min(subtotal, manualDiscount + promoDiscount + voucherDiscount);
  var pointsRequested = trusted ? Math.max(0, Math.floor(Number(p.pointsToRedeem) || 0)) : 0;
  var member = null, pointsRedeemed = 0, pointsDiscount = 0;
  var config = loyaltyConfig_(store);
  if (pointsRequested > 0) {
    if (!config.enabled) throw new Error('Program loyalty tidak aktif');
    member = ensureMemberCode_(findCustomerByPhone_(p.phone, store.id));
    if (!member) throw new Error('Member tidak ditemukan. Gunakan nomor telepon member yang terdaftar.');
    var balance = Math.max(0, Math.floor(Number(member.points) || 0));
    var maxByPercent = Math.floor((subtotal * config.maxRedeemPercent / 100) / config.pointValue);
    var maxByRemaining = Math.floor(Math.max(0, subtotal - beforePoints) / config.pointValue);
    pointsRedeemed = Math.min(pointsRequested, balance, maxByPercent, maxByRemaining);
    if (pointsRedeemed <= 0) throw new Error('Poin tidak cukup atau batas redeem tercapai');
    pointsDiscount = pointsRedeemed * config.pointValue;
  } else if (trusted && p.phone) {
    member = ensureMemberCode_(findCustomerByPhone_(p.phone, store.id));
  }

  var totalDiscount = Math.min(subtotal, manualDiscount + promoDiscount + voucherDiscount + pointsDiscount);
  return {
    totalDiscount: totalDiscount,
    manualDiscount: manualDiscount,
    discountType: manualType,
    discountValue: rawManualValue,
    promoId: promo ? String(promo.id || '') : '',
    promoName: promo ? String(promo.name || '') : '',
    promoDiscount: promoDiscount,
    voucherCode: voucher ? String(voucher.code || '').toUpperCase() : '',
    voucherDiscount: voucherDiscount,
    member: member,
    pointsRedeemed: pointsRedeemed,
    pointsDiscount: pointsDiscount
  };
}

function consumeVoucher_(code, storeId) {
  var voucher = findVoucherByCode_(code, storeId);
  if (!voucher) return;
  voucher.usedCount = Math.max(0, Math.floor(Number(voucher.usedCount) || 0)) + 1;
  voucher.updatedAt = iso_();
  var row = findRow_('Vouchers', voucher.id);
  if (row) updateRow_('Vouchers', row, voucher);
}

function releaseVoucher_(order) {
  if (!order || !order.voucherCode) return;
  var voucher = findVoucherByCode_(order.voucherCode, order.storeId);
  if (!voucher) return;
  voucher.usedCount = Math.max(0, Math.floor(Number(voucher.usedCount) || 0) - 1);
  voucher.updatedAt = iso_();
  var row = findRow_('Vouchers', voucher.id);
  if (row) updateRow_('Vouchers', row, voucher);
}

function appendLoyaltyTxn_(customer, order, type, points, note) {
  appendObject_('LoyaltyTransactions', {
    id: uuid_(), storeId: String(order.storeId || customer.storeId || ''), customerId: String(customer.id || ''),
    memberCode: String(customer.memberCode || ''), orderId: String(order.id || ''), type: String(type || ''),
    points: Number(points) || 0, balanceAfter: Math.max(0, Math.floor(Number(customer.points) || 0)), note: str_(note, 200), createdAt: iso_()
  });
}

function reserveLoyaltyPoints_(customer, order, points) {
  points = Math.max(0, Math.floor(Number(points) || 0));
  if (!customer || points <= 0) return;
  customer = ensureMemberCode_(customer);
  var balance = Math.max(0, Math.floor(Number(customer.points) || 0));
  if (balance < points) throw new Error('Saldo poin berubah dan tidak lagi mencukupi');
  customer.points = balance - points;
  customer.updatedAt = iso_();
  var row = findRow_('Customers', customer.id);
  if (row) updateRow_('Customers', row, customer);
  appendLoyaltyTxn_(customer, order, 'REDEEM', -points, 'Reservasi poin untuk order');
}

function restoreRedeemedPoints_(order, reason) {
  var points = Math.max(0, Math.floor(Number(order && order.pointsRedeemed) || 0));
  if (!order || !order.memberId || points <= 0) return;
  var existing = listObjects_('LoyaltyTransactions').some(function(t) {
    return String(t.orderId) === String(order.id) && String(t.type) === 'RESTORE_REDEEM';
  });
  if (existing) return;
  var customer = getObject_('Customers', order.memberId);
  if (!customer) return;
  customer.points = Math.max(0, Math.floor(Number(customer.points) || 0)) + points;
  customer.updatedAt = iso_();
  var row = findRow_('Customers', customer.id);
  if (row) updateRow_('Customers', row, customer);
  appendLoyaltyTxn_(customer, order, 'RESTORE_REDEEM', points, reason || 'Pengembalian poin redeem');
}

function earnLoyaltyPoints_(order) {
  if (!order || !order.phone) return {points: 0, customer: null};
  var store = resolveStore_(order.storeId);
  var config = loyaltyConfig_(store);
  if (!config.enabled) return {points: 0, customer: null};
  var customer = ensureMemberCode_(findCustomerByPhone_(order.phone, order.storeId) || ensureCustomer_(order));
  if (!customer) return {points: 0, customer: null};
  var points = Math.max(0, Math.floor((Number(order.total) || 0) / config.spendPerPoint));
  if (points <= 0) return {points: 0, customer: customer};
  customer.points = Math.max(0, Math.floor(Number(customer.points) || 0)) + points;
  customer.lifetimePoints = Math.max(0, Math.floor(Number(customer.lifetimePoints) || 0)) + points;
  customer.lastVisitAt = iso_();
  customer.updatedAt = iso_();
  var row = findRow_('Customers', customer.id);
  if (row) updateRow_('Customers', row, customer);
  appendLoyaltyTxn_(customer, order, 'EARN', points, 'Poin dari transaksi lunas');
  return {points: points, customer: customer};
}

function reverseEarnedPoints_(order) {
  var points = Math.max(0, Math.floor(Number(order && order.pointsEarned) || 0));
  if (!order || !order.memberId && !order.phone || points <= 0) return;
  var customer = order.memberId ? getObject_('Customers', order.memberId) : findCustomerByPhone_(order.phone, order.storeId);
  if (!customer) return;
  customer.points = Math.max(0, Math.floor(Number(customer.points) || 0) - points);
  customer.lifetimePoints = Math.max(0, Math.floor(Number(customer.lifetimePoints) || 0) - points);
  customer.updatedAt = iso_();
  var row = findRow_('Customers', customer.id);
  if (row) updateRow_('Customers', row, customer);
  appendLoyaltyTxn_(customer, order, 'REVERSE_EARN', -points, 'Pembalikan poin karena refund');
}

function normalizePromotion_(p) {
  var out = Object.assign({}, p || {});
  out.name = str_(out.name, 100);
  if (!out.name) throw new Error('Nama promo wajib diisi');
  out.type = String(str_(out.type, 12) || 'PERCENT').toUpperCase();
  if (['PERCENT','FIXED'].indexOf(out.type) === -1) throw new Error('Tipe promo tidak valid');
  out.value = Math.max(0, Number(out.value) || 0);
  if (out.type === 'PERCENT') out.value = Math.min(out.value, 100);
  out.minSpend = Math.max(0, Math.round(Number(out.minSpend) || 0));
  out.maxDiscount = Math.max(0, Math.round(Number(out.maxDiscount) || 0));
  out.startAt = str_(out.startAt, 32); out.endAt = str_(out.endAt, 32);
  out.active = out.active === false || out.active === 'false' ? false : true;
  out.updatedAt = iso_(); if (!out.id) out.createdAt = iso_();
  return out;
}

function normalizeVoucher_(p) {
  var out = Object.assign({}, p || {});
  out.code = str_(out.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!out.code) throw new Error('Kode voucher wajib diisi');
  out.name = str_(out.name, 100) || out.code;
  out.type = String(str_(out.type, 12) || 'FIXED').toUpperCase();
  if (['PERCENT','FIXED'].indexOf(out.type) === -1) throw new Error('Tipe voucher tidak valid');
  out.value = Math.max(0, Number(out.value) || 0); if (out.type === 'PERCENT') out.value = Math.min(out.value, 100);
  out.minSpend = Math.max(0, Math.round(Number(out.minSpend) || 0)); out.maxDiscount = Math.max(0, Math.round(Number(out.maxDiscount) || 0));
  out.usageLimit = Math.max(0, Math.floor(Number(out.usageLimit) || 0)); out.usedCount = Math.max(0, Math.floor(Number(out.usedCount) || 0));
  out.startAt = str_(out.startAt, 32); out.endAt = str_(out.endAt, 32);
  out.active = out.active === false || out.active === 'false' ? false : true;
  out.updatedAt = iso_(); if (!out.id) out.createdAt = iso_();
  return out;
}

function savePromotion_(p) {
  var actor = actorContext_(p); var existing = p.id ? getObject_('Promotions', str_(p.id,64)) : null; if (existing) assertActorStoreAccess_(existing,p);
  var item = normalizePromotion_(Object.assign({}, existing || {}, p || {}));
  item.id = item.id || uuid_(); item.storeId = effectiveStoreId_(p) || resolveStore_('').id;
  var row = existing ? findRow_('Promotions', item.id) : null; if (row) updateRow_('Promotions', row, item); else appendObject_('Promotions', item);
  return {ok:true, data:item};
}

function saveVoucher_(p) {
  var actor = actorContext_(p); var existing = p.id ? getObject_('Vouchers', str_(p.id,64)) : null; if (existing) assertActorStoreAccess_(existing,p);
  var item = normalizeVoucher_(Object.assign({}, existing || {}, p || {}));
  item.id = item.id || uuid_(); item.storeId = effectiveStoreId_(p) || resolveStore_('').id;
  var duplicate = listObjects_('Vouchers').some(function(v){ return String(v.id)!==String(item.id) && String(v.storeId)===String(item.storeId) && String(v.code).toUpperCase()===String(item.code).toUpperCase(); });
  if (duplicate) throw new Error('Kode voucher sudah digunakan');
  var row = existing ? findRow_('Vouchers', item.id) : null; if (row) updateRow_('Vouchers', row, item); else appendObject_('Vouchers', item);
  return {ok:true, data:item};
}

function getPromotions_(p) {
  var storeId = str_(p && p.storeId,64); var rows=listObjects_('Promotions');
  if (storeId) rows=rows.filter(function(r){return !r.storeId || String(r.storeId)===storeId;});
  rows.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));}); return rows;
}
function getVouchers_(p) {
  var storeId = str_(p && p.storeId,64); var rows=listObjects_('Vouchers');
  if (storeId) rows=rows.filter(function(r){return !r.storeId || String(r.storeId)===storeId;});
  rows.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));}); return rows;
}
function findCustomer_(p) {
  var customer = findCustomerByPhone_(p && p.phone, str_(p && p.storeId,64));
  return customer ? ensureMemberCode_(customer) : null;
}
function getLoyaltyTransactions_(p) {
  var customerId=str_(p && p.customerId,64), limit=Math.min(Math.max(Math.floor(Number(p&&p.limit)||100),1),500);
  var storeId=str_(p && p.storeId,64); var rows=listObjects_('LoyaltyTransactions'); if(storeId) rows=rows.filter(function(r){return String(r.storeId||'')===storeId;}); if(customerId) rows=rows.filter(function(r){return String(r.customerId)===customerId;});
  rows.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));}); return rows.slice(0,limit);
}

/* ---------------- Orders ---------------- */

/**
 * Membuat order. Harga SELALU dibaca dari sheet Menu, bukan dari client,
 * supaya pelanggan tidak bisa mengirim harga sendiri lewat DevTools.
 * Diskon hanya dihormati bila payload ditandai `_admin` oleh proxy server.
 * Stok menu yang terlacak otomatis berkurang; item dengan stok kurang ditolak.
 */
function createOrder_(p) {
  ensureHeaders_('Orders');
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Pesanan tidak boleh kosong');
  if (items.length > 60) throw new Error('Terlalu banyak item dalam satu pesanan');

  var trusted = p._admin === true;
  var store = resolveStore_(p.storeId);
  var clientOrderId = str_(p.clientOrderId, 96);

  // Idempotency: retry dengan key yang sama mengembalikan order lama tanpa
  // membuat baris baru atau mengurangi stok untuk kedua kalinya.
  if (clientOrderId) {
    var duplicate = findOrderByClientOrderId_(store.id, clientOrderId);
    if (duplicate) return {ok: true, data: getOrderWithItems_(duplicate.id), deduplicated: true};
  }

  var menuRows = listObjects_('Menu').filter(function(m){ return String(m.storeId || '') === String(store.id); });
  var menuById = indexBy_(menuRows, 'id');
  var recipeRows = listObjects_('Recipes').filter(function(r){ return String(r.storeId || '') === String(store.id); });
  var recipesByMenu = groupBy_(recipeRows, 'menuItemId');
  var inventoryRows = listObjects_('Inventory').filter(function(i){ return String(i.storeId || '') === String(store.id); });
  var inventoryById = indexBy_(inventoryRows, 'id');
  var subtotal = 0;
  var stockUsage = {};
  var ingredientUsage = {};
  var cleanItems = items.map(function(raw, index) {
    var menuItemId = str_(raw && (raw.menuItemId || raw.id), 64);
    if (!menuItemId) throw new Error('Item #' + (index + 1) + ' tidak memiliki menuItemId');
    var menuItem = menuById[menuItemId];
    if (!menuItem) throw new Error('Menu tidak ditemukan: ' + menuItemId);
    if (!isActive_(menuItem)) throw new Error('Menu tidak tersedia: ' + (menuItem.name || menuItemId));
    var qty = Math.floor(Number(raw.qty));
    if (!isFinite(qty) || qty < 1 || qty > 99) throw new Error('Qty item #' + (index + 1) + ' harus 1-99');
    var price = Number(menuItem.price) || 0;
    var unitCost = recipeCostForMenu_(menuItemId, recipesByMenu, inventoryById, Number(menuItem.cost) || 0);
    subtotal += price * qty;
    stockUsage[menuItemId] = (stockUsage[menuItemId] || 0) + qty;
    (recipesByMenu[menuItemId] || []).forEach(function(recipe) {
      var inventoryId = String(recipe.inventoryId || '');
      if (!inventoryId) return;
      var used = Math.max(0, Number(recipe.qty) || 0) * qty;
      ingredientUsage[inventoryId] = (ingredientUsage[inventoryId] || 0) + used;
    });
    return {id: uuid_(), menuItemId: menuItemId, name: String(menuItem.name || ''), price: price, qty: qty, note: str_(raw.note, 200), cost: unitCost};
  });

  var stockDecimals = {};
  Object.keys(stockUsage).forEach(function(menuItemId) {
    var menuItem = menuById[menuItemId];
    var stock = menuItem.stock;
    if (stock === '' || stock === null || stock === undefined || !isFinite(Number(stock))) return;
    var available = Math.floor(Number(stock));
    var needed = stockUsage[menuItemId];
    if (available < needed) throw new Error('Stok tidak cukup untuk ' + menuItem.name + ' (sisa ' + Math.max(available, 0) + ')');
    stockDecimals[menuItemId] = available - needed;
  });

  var inventoryAfter = {};
  Object.keys(ingredientUsage).forEach(function(inventoryId) {
    var ingredient = inventoryById[inventoryId];
    if (!ingredient) throw new Error('Bahan resep tidak ditemukan: ' + inventoryId);
    var available = Number(ingredient.stock) || 0;
    var needed = ingredientUsage[inventoryId];
    if (needed < 0) throw new Error('Qty resep tidak valid untuk ' + ingredient.name);
    if (available + 1e-9 < needed) throw new Error('Stok bahan tidak cukup untuk ' + ingredient.name + ' (sisa ' + available + ' ' + ingredient.unit + ')');
    inventoryAfter[inventoryId] = available - needed;
  });

  var taxRate = numberOr_(store.taxRate, 0);
  var serviceRate = numberOr_(store.serviceRate, 0);
  var discountInfo = calculateOrderDiscounts_(p, store, subtotal, trusted);
  var discount = discountInfo.totalDiscount;
  var tax = Math.round(subtotal * (taxRate > 1 ? taxRate / 100 : taxRate));
  var service = Math.round(subtotal * (serviceRate > 1 ? serviceRate / 100 : serviceRate));
  var channel = String(str_(p.channel, 8)).toUpperCase();
  if (ORDER_CHANNELS.indexOf(channel) === -1) channel = 'QR';
  var tableCode = str_(p.tableCode, 32);
  var actor = actorContext_(p);
  var shift = channel === 'POS' ? requireOpenShiftForActor_(actor, store.id) : null;

  var order = {
    id: 'ORD-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    storeId: store.id || str_(p.storeId, 64),
    tableId: resolveTableId_(store.id, tableCode, str_(p.tableId, 64)),
    tableCode: tableCode,
    customerName: str_(p.customerName, 80),
    phone: str_(p.phone, 20).replace(/[^0-9+]/g, ''),
    channel: channel,
    status: 'NEW',
    subtotal: subtotal,
    discount: discount,
    tax: tax,
    service: service,
    total: subtotal - discount + tax + service,
    note: str_(p.note, 300),
    createdAt: iso_(),
    updatedAt: iso_(),
    paymentMethod: '',
    paidAmount: '',
    changeAmount: '',
    clientOrderId: clientOrderId,
    cancelReason: '',
    cancelledAt: '',
    refundedAmount: '',
    refundReason: '',
    refundedAt: '',
    staffId: actor.id || '',
    staffName: actor.name || '',
    shiftId: shift ? shift.id : '',
    registerId: shift ? shift.registerId : '',
    manualDiscount: discountInfo.manualDiscount,
    discountType: discountInfo.discountType,
    discountValue: discountInfo.discountValue,
    promoId: discountInfo.promoId,
    promoName: discountInfo.promoName,
    promoDiscount: discountInfo.promoDiscount,
    voucherCode: discountInfo.voucherCode,
    voucherDiscount: discountInfo.voucherDiscount,
    memberId: discountInfo.member ? String(discountInfo.member.id || '') : '',
    memberCode: discountInfo.member ? String(discountInfo.member.memberCode || '') : '',
    pointsRedeemed: discountInfo.pointsRedeemed,
    pointsDiscount: discountInfo.pointsDiscount,
    pointsEarned: 0,
    paymentSummary: '',
    splitFromOrderId: ''
  };

  appendObject_('Orders', order);
  appendRows_('OrderItems', cleanItems.map(function(item) { return Object.assign({orderId: order.id}, item); }));
  var ingredientSnapshots = [];
  cleanItems.forEach(function(item) {
    (recipesByMenu[String(item.menuItemId)] || []).forEach(function(recipe) {
      var inv = inventoryById[String(recipe.inventoryId)] || {};
      ingredientSnapshots.push({id: uuid_(), orderId: order.id, orderItemId: item.id, menuItemId: item.menuItemId, inventoryId: String(recipe.inventoryId || ''), qty: (Number(recipe.qty) || 0) * item.qty, unitCost: Number(inv.cost) || 0});
    });
  });
  appendRows_('OrderIngredientUsage', ingredientSnapshots);

  Object.keys(stockDecimals).forEach(function(menuItemId) {
    var row = findRow_('Menu', menuItemId);
    if (!row) return;
    var menuItem = menuById[menuItemId];
    menuItem.stock = stockDecimals[menuItemId];
    menuItem.updatedAt = iso_();
    updateRow_('Menu', row, menuItem);
  });

  var movementRows = [];
  Object.keys(inventoryAfter).forEach(function(inventoryId) {
    var ingredient = inventoryById[inventoryId];
    var before = Number(ingredient.stock) || 0;
    var used = ingredientUsage[inventoryId];
    ingredient.stock = inventoryAfter[inventoryId];
    ingredient.updatedAt = iso_();
    var invRow = findRow_('Inventory', inventoryId);
    if (invRow) updateRow_('Inventory', invRow, ingredient);
    movementRows.push(stockMovementObject_(ingredient, -used, before, ingredient.stock, 'SALE', 'ORDER', order.id, 'Pemakaian resep untuk ' + order.id, actor));
  });
  appendRows_('StockMovements', movementRows);

  if (order.phone) ensureCustomer_(order);
  if (discountInfo.pointsRedeemed > 0 && discountInfo.member) reserveLoyaltyPoints_(discountInfo.member, order, discountInfo.pointsRedeemed);
  if (discountInfo.voucherCode) consumeVoucher_(discountInfo.voucherCode, order.storeId);

  appendObject_('AuditLog', {
    id: uuid_(), storeId: order.storeId, userId: actor.id || (trusted ? 'staff' : 'customer'), action: 'CREATE', entity: 'ORDER', entityId: order.id,
    detail: JSON.stringify({channel: order.channel, table: order.tableCode, total: order.total, discount: order.discount, promo: order.promoName, voucher: order.voucherCode, pointsRedeemed: order.pointsRedeemed, clientOrderId: clientOrderId}), createdAt: iso_()
  });
  return {ok: true, data: Object.assign({}, order, {items: cleanItems})};
}

function payOrder_(p) {
  ensureHeaders_('Orders');
  var id = requireId_(p.id);
  var order = getObject_('Orders', id);
  if (!order) throw new Error('Order tidak ditemukan');
  assertActorStoreAccess_(order, p);
  var current = String(order.status).toUpperCase();
  if (current === 'PAID') throw new Error('Order sudah dibayar');
  if (current === 'REFUNDED') throw new Error('Order sudah direfund');
  if (current === 'CANCELLED') throw new Error('Order sudah dibatalkan');

  var actor = actorContext_(p);
  var shift = requireOpenShiftForActor_(actor, order.storeId);
  if (shift) {
    order.staffId = actor.id;
    order.staffName = actor.name;
    order.shiftId = shift.id;
    order.registerId = shift.registerId;
  }

  var total = Math.round(Number(order.total) || 0);
  var rawPayments = Array.isArray(p.payments) ? p.payments : null;
  if (!rawPayments || !rawPayments.length) {
    rawPayments = [{method: p.method, amount: total, receivedAmount: p.paidAmount, reference: p.reference || ''}];
  }
  if (rawPayments.length > 5) throw new Error('Maksimal 5 metode pembayaran');

  var seenMethods = {}, allocated = 0, received = 0, totalChange = 0;
  var payments = rawPayments.map(function(raw, index) {
    var method = String(str_(raw && raw.method, 16)).toUpperCase();
    if (PAYMENT_METHODS.indexOf(method) === -1) throw new Error('Metode pembayaran #' + (index + 1) + ' tidak valid');
    if (seenMethods[method]) throw new Error('Metode pembayaran tidak boleh duplikat dalam split payment');
    seenMethods[method] = true;
    var amount = Math.round(Number(raw.amount));
    if (!isFinite(amount) || amount <= 0) throw new Error('Nominal pembayaran #' + (index + 1) + ' harus lebih dari 0');
    var receivedAmount = method === 'CASH' ? Math.round(Number(raw.receivedAmount !== undefined ? raw.receivedAmount : raw.paidAmount)) : amount;
    if (!isFinite(receivedAmount)) receivedAmount = 0;
    if (method === 'CASH' && receivedAmount < amount) throw new Error('Uang tunai yang diterima kurang dari alokasi tunai');
    var changeAmount = method === 'CASH' ? receivedAmount - amount : 0;
    allocated += amount; received += receivedAmount; totalChange += changeAmount;
    return {method: method, amount: amount, receivedAmount: receivedAmount, changeAmount: changeAmount, reference: str_(raw.reference, 80)};
  });
  if (allocated !== total) throw new Error('Total split payment harus tepat sama dengan total tagihan');

  order.paymentMethod = payments.length === 1 ? payments[0].method : 'SPLIT';
  order.paidAmount = received;
  order.changeAmount = totalChange;
  order.paymentSummary = JSON.stringify(payments);
  order.status = 'PAID';
  order.updatedAt = iso_();

  var customer = order.phone ? applyCustomerPayment_(order, 1) : null;
  var earned = earnLoyaltyPoints_(order);
  if (earned && earned.customer) {
    order.memberId = String(earned.customer.id || order.memberId || '');
    order.memberCode = String(earned.customer.memberCode || order.memberCode || '');
    order.pointsEarned = earned.points;
  }

  var row = findRow_('Orders', id);
  if (row) updateRow_('Orders', row, order);
  var paymentRows = payments.map(function(pay) {
    return {
      id: uuid_(), storeId: order.storeId, orderId: order.id, method: pay.method, amount: pay.amount,
      receivedAmount: pay.receivedAmount, changeAmount: pay.changeAmount, reference: pay.reference,
      staffId: actor.id || order.staffId || '', staffName: actor.name || order.staffName || '', shiftId: order.shiftId || '', registerId: order.registerId || '', createdAt: iso_()
    };
  });
  appendRows_('Payments', paymentRows);

  appendObject_('AuditLog', {
    id: uuid_(), storeId: order.storeId, userId: actor.id || 'staff', action: 'PAYMENT', entity: 'ORDER', entityId: id,
    detail: JSON.stringify({from: current, to: 'PAID', methods: payments, total: total, paid: received, change: totalChange, pointsEarned: order.pointsEarned || 0}), createdAt: iso_()
  });
  return {ok: true, data: Object.assign({}, getOrderWithItems_(id), {payments: paymentRows})};
}

function refundOrder_(p) {
  ensureHeaders_('Orders');
  var id = requireId_(p.id);
  var reason = str_(p.reason, 300);
  if (!reason) throw new Error('Alasan refund wajib diisi');
  var row = findRow_('Orders', id);
  if (!row) throw new Error('Order tidak ditemukan');
  var order = getObject_('Orders', id);
  assertActorStoreAccess_(order, p);
  var current = String(order.status).toUpperCase();
  if (current === 'REFUNDED') throw new Error('Order sudah direfund');
  if (current !== 'PAID') throw new Error('Hanya order PAID yang dapat direfund');

  var actor = actorContext_(p);
  var restock = p.restock === true;
  if (restock) restoreOrderStock_(id);
  reverseEarnedPoints_(order);
  restoreRedeemedPoints_(order, 'Refund order');
  order.status = 'REFUNDED';
  order.refundedAmount = Math.round(Number(order.total) || 0);
  order.refundReason = reason;
  order.refundedAt = iso_();
  order.updatedAt = iso_();
  updateRow_('Orders', row, order);
  if (order.phone) applyCustomerPayment_(order, -1);

  appendObject_('AuditLog', {
    id: uuid_(), storeId: order.storeId, userId: actor.id || 'staff', action: 'REFUND', entity: 'ORDER', entityId: id,
    detail: JSON.stringify({amount: order.refundedAmount, reason: reason, restock: restock, originalPaymentMethod: order.paymentMethod}), createdAt: iso_()
  });
  return {ok: true, data: order};
}

function updateOrderStatus_(p) {
  ensureHeaders_('Orders');
  var id = requireId_(p.id);
  var status = String(str_(p.status, 16)).toUpperCase();
  if (ORDER_STATUSES.indexOf(status) === -1) throw new Error('Status tidak valid: ' + status);
  if (status === 'PAID') throw new Error('Status PAID hanya boleh melalui proses pembayaran');
  if (status === 'REFUNDED') throw new Error('Status REFUNDED hanya boleh melalui proses refund');
  var row = findRow_('Orders', id);
  if (!row) throw new Error('Order tidak ditemukan');
  var order = getObject_('Orders', id);
  assertActorStoreAccess_(order, p);
  var current = String(order.status).toUpperCase();
  var actor = actorContext_(p);
  if (current === status) return {ok: true, data: order};
  if (current === 'PAID') throw new Error('Order sudah dibayar; gunakan refund bila perlu membatalkan transaksi');
  if (current === 'REFUNDED') throw new Error('Order sudah direfund dan bersifat final');
  if (current === 'CANCELLED') throw new Error('Order sudah dibatalkan dan bersifat final');

  var allowed = {NEW: ['CONFIRMED','CANCELLED'], CONFIRMED: ['COOKING','CANCELLED'], COOKING: ['READY','CANCELLED'], READY: ['SERVED','CANCELLED'], SERVED: []};
  if ((allowed[current] || []).indexOf(status) === -1) throw new Error('Transisi status tidak diizinkan: ' + current + ' → ' + status);
  if (status === 'CANCELLED') {
    var reason = str_(p.reason, 300);
    if (!reason) throw new Error('Alasan pembatalan wajib diisi');
    restoreOrderStock_(id);
    restoreRedeemedPoints_(order, 'Order dibatalkan');
    releaseVoucher_(order);
    order.cancelReason = reason;
    order.cancelledAt = iso_();
  }
  order.status = status;
  order.updatedAt = iso_();
  updateRow_('Orders', row, order);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: order.storeId, userId: actor.id || 'staff', action: status === 'CANCELLED' ? 'VOID' : 'STATUS', entity: 'ORDER', entityId: id,
    detail: JSON.stringify({from: current, to: status, reason: status === 'CANCELLED' ? order.cancelReason : ''}), createdAt: iso_()
  });
  return {ok: true, data: order};
}

function splitOrder_(p) {
  var id = requireId_(p.id);
  var order = getObject_('Orders', id);
  if (!order) throw new Error('Order tidak ditemukan');
  assertActorStoreAccess_(order, p);
  var status = String(order.status || '').toUpperCase();
  if (['PAID','REFUNDED','CANCELLED'].indexOf(status) !== -1) throw new Error('Order final tidak dapat di-split');
  if (Math.round(Number(order.discount) || 0) > 0) throw new Error('Split bill dilakukan sebelum promo/diskon/redeem poin diterapkan');
  var selections = Array.isArray(p.items) ? p.items : [];
  if (!selections.length) throw new Error('Pilih minimal satu item untuk split bill');

  var items = listObjects_('OrderItems').filter(function(item){ return String(item.orderId) === String(id); });
  var byId = indexBy_(items, 'id');
  var wanted = {};
  selections.forEach(function(sel, index){
    var itemId = str_(sel && (sel.orderItemId || sel.id),64);
    var qty = Math.floor(Number(sel && sel.qty));
    if (!itemId || !byId[itemId]) throw new Error('Item split #' + (index + 1) + ' tidak ditemukan');
    if (!isFinite(qty) || qty < 1 || qty > Number(byId[itemId].qty)) throw new Error('Qty split #' + (index + 1) + ' tidak valid');
    wanted[itemId] = qty;
  });
  var movedQty = 0, totalQty = 0;
  items.forEach(function(item){ totalQty += Number(item.qty)||0; movedQty += wanted[String(item.id)] || 0; });
  if (movedQty <= 0 || movedQty >= totalQty) throw new Error('Split bill harus memindahkan sebagian, bukan seluruh order');

  var movedItems = [], remainingSubtotal = 0, movedSubtotal = 0, splitMap = {};
  items.forEach(function(item){
    var moveQty = wanted[String(item.id)] || 0;
    var originalQty = Number(item.qty) || 0;
    var remainQty = originalQty - moveQty;
    if (moveQty > 0) {
      var moved = {id: uuid_(), orderId: '', menuItemId:item.menuItemId, name:item.name, price:Number(item.price)||0, qty:moveQty, note:item.note||'', cost:Number(item.cost)||0};
      movedItems.push(moved);
      splitMap[String(item.id)] = {newItemId:moved.id, originalQty:originalQty, movedQty:moveQty, remainingQty:remainQty};
      movedSubtotal += (Number(item.price)||0) * moveQty;
    }
    if (remainQty > 0) {
      item.qty = remainQty;
      remainingSubtotal += (Number(item.price)||0) * remainQty;
      var row = findRow_('OrderItems', item.id); if (row) updateRow_('OrderItems', row, item);
    } else if (moveQty > 0) {
      deleteObject_('OrderItems', item.id);
    }
  });

  var originalTax = Math.round(Number(order.tax)||0), originalService = Math.round(Number(order.service)||0);
  var originalSubtotal = Math.max(1, Math.round(Number(order.subtotal)||0));
  var movedTax = Math.round(originalTax * movedSubtotal / originalSubtotal);
  var movedService = Math.round(originalService * movedSubtotal / originalSubtotal);
  var now = iso_();
  var newOrder = Object.assign({}, order, {
    id: 'ORD-' + Utilities.getUuid().slice(0,8).toUpperCase(), subtotal:movedSubtotal, discount:0,
    tax:movedTax, service:movedService, total:movedSubtotal + movedTax + movedService,
    createdAt:now, updatedAt:now, paymentMethod:'', paidAmount:'', changeAmount:'', paymentSummary:'', clientOrderId:'SPLIT-' + Utilities.getUuid(),
    cancelReason:'', cancelledAt:'', refundedAmount:'', refundReason:'', refundedAt:'', pointsEarned:0, splitFromOrderId:id
  });
  movedItems.forEach(function(item){ item.orderId = newOrder.id; });
  appendObject_('Orders', newOrder); appendRows_('OrderItems', movedItems);

  // Pindahkan snapshot pemakaian bahan secara proporsional. Tidak ada perubahan stok
  // saat split karena bahan sudah dikonsumsi ketika order asli dibuat.
  var usageRows = listObjects_('OrderIngredientUsage').filter(function(u){ return String(u.orderId) === String(id); });
  var movedUsageRows = [];
  usageRows.forEach(function(u){
    var map = splitMap[String(u.orderItemId || '')];
    if (!map) return;
    var originalUsageQty = Number(u.qty) || 0;
    var movedUsageQty = map.originalQty > 0 ? originalUsageQty * map.movedQty / map.originalQty : 0;
    if (movedUsageQty <= 0) return;
    movedUsageRows.push({
      id: uuid_(), orderId: newOrder.id, orderItemId: map.newItemId, menuItemId: u.menuItemId,
      inventoryId: u.inventoryId, qty: movedUsageQty, unitCost: Number(u.unitCost) || 0
    });
    var remainUsageQty = originalUsageQty - movedUsageQty;
    if (remainUsageQty > 1e-9) {
      u.qty = remainUsageQty;
      var usageRow = findRow_('OrderIngredientUsage', u.id); if (usageRow) updateRow_('OrderIngredientUsage', usageRow, u);
    } else {
      deleteObject_('OrderIngredientUsage', u.id);
    }
  });
  appendRows_('OrderIngredientUsage', movedUsageRows);

  order.subtotal = remainingSubtotal; order.tax = originalTax - movedTax; order.service = originalService - movedService;
  order.total = remainingSubtotal + Number(order.tax||0) + Number(order.service||0); order.updatedAt = now;
  var orderRow = findRow_('Orders', id); if (orderRow) updateRow_('Orders', orderRow, order);
  var actor=actorContext_(p);
  appendObject_('AuditLog',{id:uuid_(),storeId:order.storeId,userId:actor.id||'staff',action:'SPLIT',entity:'ORDER',entityId:id,detail:JSON.stringify({newOrderId:newOrder.id,movedItems:movedItems.map(function(i){return {name:i.name,qty:i.qty};})}),createdAt:now});
  return {ok:true,data:{original:getOrderWithItems_(id),split:getOrderWithItems_(newOrder.id)}};
}

function listOrders_(p) {
  var limit = Math.min(Math.max(Math.floor(Number(p && p.limit) || 200), 1), 1000);
  var storeId = str_(p && p.storeId, 64);
  var status = String(str_(p && p.status, 16)).toUpperCase();
  var withItems = p && p.withItems === true;
  var rows = listObjects_('Orders');
  if (storeId) rows = rows.filter(function(o) { return String(o.storeId) === storeId; });
  if (status && ORDER_STATUSES.indexOf(status) !== -1) {
    rows = rows.filter(function(o) { return String(o.status).toUpperCase() === status; });
  }
  rows.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  rows = rows.slice(0, limit);

  // Sambungkan item dalam satu pembacaan sheet (bukan satu panggilan per order).
  if (withItems && rows.length) {
    var byOrder = {};
    listObjects_('OrderItems').forEach(function(item) {
      var key = String(item.orderId);
      (byOrder[key] = byOrder[key] || []).push(item);
    });
    rows = rows.map(function(o) {
      o.items = byOrder[String(o.id)] || [];
      return o;
    });
  }
  return rows;
}

function getOrderWithItems_(id) {
  var order = getObject_('Orders', id);
  if (!order) throw new Error('Order tidak ditemukan');
  order.items = listObjects_('OrderItems').filter(function(item) {
    return String(item.orderId) === String(id);
  });
  order.payments = listObjects_('Payments').filter(function(pay) { return String(pay.orderId) === String(id); });
  return order;
}

function getOrderWithItemsScoped_(p) {
  var order = getOrderWithItems_(requireId_(p.id));
  assertActorStoreAccess_(order, p);
  return order;
}

function findOrderByClientOrderId_(storeId, clientOrderId) {
  if (!clientOrderId) return null;
  var orders = listObjects_('Orders');
  for (var i = 0; i < orders.length; i++) {
    if (String(orders[i].clientOrderId || '') !== String(clientOrderId)) continue;
    if (storeId && String(orders[i].storeId || '') !== String(storeId)) continue;
    return orders[i];
  }
  return null;
}

function restoreOrderStock_(orderId) {
  var usage = {};
  listObjects_('OrderItems').forEach(function(item) {
    if (String(item.orderId) !== String(orderId)) return;
    var menuItemId = String(item.menuItemId || '');
    if (!menuItemId) return;
    usage[menuItemId] = (usage[menuItemId] || 0) + (Number(item.qty) || 0);
  });
  Object.keys(usage).forEach(function(menuItemId) {
    var row = findRow_('Menu', menuItemId);
    if (!row) return;
    var menuItem = getObject_('Menu', menuItemId);
    if (!menuItem) return;
    var currentStock = menuItem.stock;
    if (currentStock === '' || currentStock === null || currentStock === undefined || !isFinite(Number(currentStock))) return;
    menuItem.stock = Math.max(0, Math.floor(Number(currentStock))) + usage[menuItemId];
    menuItem.updatedAt = iso_();
    updateRow_('Menu', row, menuItem);
  });
  restoreIngredientStock_(orderId);
}

/** Mengembalikan bahan berdasarkan snapshot pemakaian per item (Stage 5).
 * Untuk transaksi Stage 3-4 yang belum memiliki snapshot, fallback ke StockMovements SALE.
 */
function restoreIngredientStock_(orderId) {
  var movements = listObjects_('StockMovements');
  var already = movements.some(function(m) {
    return String(m.referenceType) === 'ORDER' && String(m.referenceId) === String(orderId) && String(m.type) === 'RETURN';
  });
  if (already) return;

  var usage = {};
  var snapshots = listObjects_('OrderIngredientUsage').filter(function(u) { return String(u.orderId) === String(orderId); });
  if (snapshots.length) {
    snapshots.forEach(function(u) {
      var inventoryId = String(u.inventoryId || '');
      var qty = Number(u.qty) || 0;
      if (!inventoryId || qty <= 0) return;
      usage[inventoryId] = (usage[inventoryId] || 0) + qty;
    });
  } else {
    // Kompatibilitas order lama sebelum Stage 5.
    movements.forEach(function(m) {
      if (String(m.referenceType) !== 'ORDER' || String(m.referenceId) !== String(orderId) || String(m.type) !== 'SALE') return;
      var inventoryId = String(m.inventoryId || '');
      if (!inventoryId) return;
      var qty = Number(m.qty) || 0;
      if (qty < 0) usage[inventoryId] = (usage[inventoryId] || 0) + Math.abs(qty);
    });
  }

  var order = getObject_('Orders', orderId) || {};
  var actor = {id: String(order.staffId || ''), name: String(order.staffName || '')};
  var rows = [];
  Object.keys(usage).forEach(function(inventoryId) {
    var ingredient = getObject_('Inventory', inventoryId);
    var row = findRow_('Inventory', inventoryId);
    if (!ingredient || !row) return;
    var before = Number(ingredient.stock) || 0;
    ingredient.stock = before + usage[inventoryId];
    ingredient.updatedAt = iso_();
    updateRow_('Inventory', row, ingredient);
    rows.push(stockMovementObject_(ingredient, usage[inventoryId], before, ingredient.stock, 'RETURN', 'ORDER', orderId, 'Pengembalian bahan dari order ' + orderId, actor));
  });
  appendRows_('StockMovements', rows);
}

function ensureCustomer_(order) {
  var rows = listObjects_('Customers');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].phone && String(rows[i].phone) === String(order.phone)) { found = rows[i]; break; }
  }
  if (found) {
    found.name = order.customerName || found.name;
    if (!found.memberCode) found.memberCode = 'KAS-' + Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
    if (found.points === '' || found.points === undefined) found.points = 0;
    if (found.lifetimePoints === '' || found.lifetimePoints === undefined) found.lifetimePoints = 0;
    found.updatedAt = iso_();
    var row = findRow_('Customers', found.id);
    if (row) updateRow_('Customers', row, found);
    return found;
  }
  var customer = {id: uuid_(), storeId: order.storeId, name: order.customerName || 'Guest', phone: order.phone, email: '', tier: 'MEMBER', visits: 0, totalSpend: 0, preferences: '{}', createdAt: iso_(), updatedAt: iso_(), memberCode: 'KAS-' + Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase(), points: 0, lifetimePoints: 0, lastVisitAt: ''};
  appendObject_('Customers', customer);
  return customer;
}

function applyCustomerPayment_(order, direction) {
  var customer = ensureCustomer_(order);
  if (!customer) return null;
  var dir = direction < 0 ? -1 : 1;
  customer.visits = Math.max(0, (Number(customer.visits) || 0) + dir);
  customer.totalSpend = Math.max(0, (Number(customer.totalSpend) || 0) + dir * (Number(order.total) || 0));
  customer.lastVisitAt = iso_();
  customer.updatedAt = iso_();
  var row = findRow_('Customers', customer.id);
  if (row) updateRow_('Customers', row, customer);
  return customer;
}

/* ---------------- Inventory Pro ---------------- */

/** Menyimpan master bahan sekaligus mencatat perubahan stok manual ke ledger. */
function saveInventory_(p) {
  var id = str_(p.id, 64);
  var existing = id ? getObject_('Inventory', id) : null;
  if (existing) assertActorStoreAccess_(existing, p);
  var actor = actorContext_(p);
  var merged = Object.assign({}, existing || {}, p || {});
  var item = normalizeInventory_(merged);
  item.id = id || uuid_();
  item.storeId = effectiveStoreId_(p) || resolveStore_('').id;
  var before = existing ? (Number(existing.stock) || 0) : 0;
  var after = Number(item.stock) || 0;
  if (after < 0) throw new Error('Stok tidak boleh negatif');
  var row = existing ? findRow_('Inventory', item.id) : null;
  if (row) updateRow_('Inventory', row, item);
  else appendObject_('Inventory', item);
  var delta = after - before;
  if (Math.abs(delta) > 1e-9) {
    appendObject_('StockMovements', stockMovementObject_(item, delta, before, after, existing ? 'ADJUSTMENT' : 'INITIAL', 'INVENTORY', item.id, existing ? 'Perubahan stok dari master bahan' : 'Stok awal bahan', actor));
  }
  refreshMenuCostsForInventory_([item.id]);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: item.storeId, userId: actor.id || 'staff', action: existing ? 'UPDATE' : 'CREATE', entity: 'INVENTORY', entityId: item.id,
    detail: JSON.stringify({name: item.name, stockBefore: before, stockAfter: after, unit: item.unit, cost: item.cost}), createdAt: iso_()
  });
  return {ok: true, data: getObject_('Inventory', item.id)};
}

function normalizeSupplier_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama supplier wajib diisi');
  out.phone = str_(p.phone, 24).replace(/[^0-9+]/g, '');
  out.email = str_(p.email, 160).toLowerCase();
  out.address = str_(p.address, 300);
  out.note = str_(p.note, 300);
  out.active = p.active === false || p.active === 'false' ? false : true;
  out.storeId = effectiveStoreId_(p) || resolveStore_('').id;
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

/** Satu menu boleh memiliki banyak bahan. Save recipe mengganti seluruh BOM menu tersebut secara atomik di dalam lock. */
function saveRecipe_(p) {
  var menuItemId = requireId_(p.menuItemId);
  var menu = getObject_('Menu', menuItemId);
  if (!menu) throw new Error('Menu tidak ditemukan');
  assertActorStoreAccess_(menu, p);
  var rawItems = Array.isArray(p.items) ? p.items : [];
  if (rawItems.length > 40) throw new Error('Terlalu banyak bahan dalam satu resep');
  var inventoryById = indexBy_(listObjects_('Inventory').filter(function(inv){ return String(inv.storeId || '') === String(menu.storeId || ''); }), 'id');
  var combined = {};
  rawItems.forEach(function(raw, index) {
    var inventoryId = str_(raw && raw.inventoryId, 64);
    var qty = Number(raw && raw.qty);
    if (!inventoryId || !inventoryById[inventoryId]) throw new Error('Bahan resep #' + (index + 1) + ' tidak ditemukan');
    if (!isFinite(qty) || qty <= 0 || qty > 1000000) throw new Error('Qty resep #' + (index + 1) + ' harus lebih dari 0');
    combined[inventoryId] = (combined[inventoryId] || 0) + qty;
  });

  // Hapus BOM lama untuk menu ini, lalu tulis versi baru.
  listObjects_('Recipes').filter(function(r) { return String(r.menuItemId) === String(menuItemId); }).forEach(function(r) {
    var row = findRow_('Recipes', r.id);
    if (row) sheet_('Recipes').deleteRow(row);
  });

  var storeId = String(menu.storeId || resolveStore_('').id);
  var rows = Object.keys(combined).map(function(inventoryId) {
    var inv = inventoryById[inventoryId];
    return {id: uuid_(), storeId: storeId, menuItemId: menuItemId, inventoryId: inventoryId, qty: combined[inventoryId], unit: String(inv.unit || 'pcs')};
  });
  appendRows_('Recipes', rows);

  // Sinkronkan modal menu dengan biaya resep saat ini. Jika resep dikosongkan, cost lama dipertahankan.
  if (rows.length) {
    var grouped = {}; grouped[menuItemId] = rows;
    menu.cost = Math.round(recipeCostForMenu_(menuItemId, grouped, inventoryById, Number(menu.cost) || 0));
    menu.updatedAt = iso_();
    var menuRow = findRow_('Menu', menuItemId);
    if (menuRow) updateRow_('Menu', menuRow, menu);
  }

  var actor = actorContext_(p);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: storeId, userId: actor.id || 'staff', action: 'UPDATE', entity: 'RECIPE', entityId: menuItemId,
    detail: JSON.stringify({ingredients: rows.length, calculatedCost: Number(menu.cost) || 0}), createdAt: iso_()
  });
  return {ok: true, data: getRecipes_({menuItemId: menuItemId})};
}

function getRecipes_(p) {
  var menuItemId = str_(p && p.menuItemId, 64);
  var storeId = str_(p && p.storeId, 64);
  var rows = listObjects_('Recipes');
  if (menuItemId) rows = rows.filter(function(r) { return String(r.menuItemId) === menuItemId; });
  if (storeId) rows = rows.filter(function(r) { return String(r.storeId) === storeId; });
  var menuById = indexBy_(listObjects_('Menu'), 'id');
  var invById = indexBy_(listObjects_('Inventory'), 'id');
  return rows.map(function(r) {
    var menu = menuById[String(r.menuItemId)] || {};
    var inv = invById[String(r.inventoryId)] || {};
    return Object.assign({}, r, {
      menuName: String(menu.name || ''), inventoryName: String(inv.name || ''), unit: String(inv.unit || r.unit || 'pcs'),
      unitCost: Number(inv.cost) || 0, lineCost: (Number(r.qty) || 0) * (Number(inv.cost) || 0)
    });
  });
}

function createPurchase_(p) {
  var actor = actorContext_(p);
  var store = resolveStore_(str_(p.storeId, 64) || actor.storeId);
  var supplierId = requireId_(p.supplierId);
  var supplier = getObject_('Suppliers', supplierId);
  if (!supplier || !isActive_(supplier) || String(supplier.storeId||'') !== String(store.id||'')) throw new Error('Supplier tidak ditemukan atau tidak aktif pada outlet ini');
  var rawItems = Array.isArray(p.items) ? p.items : [];
  if (!rawItems.length) throw new Error('Pembelian harus memiliki minimal satu item');
  if (rawItems.length > 100) throw new Error('Terlalu banyak item pembelian');
  var invById = indexBy_(listObjects_('Inventory').filter(function(inv){ return String(inv.storeId||'') === String(store.id||''); }), 'id');
  var items = [];
  var total = 0;
  rawItems.forEach(function(raw, index) {
    var inventoryId = str_(raw && raw.inventoryId, 64);
    var inv = invById[inventoryId];
    if (!inv) throw new Error('Bahan pembelian #' + (index + 1) + ' tidak ditemukan');
    var qty = Number(raw && raw.qty);
    var unitCost = Number(raw && raw.unitCost);
    if (!isFinite(qty) || qty <= 0 || qty > 100000000) throw new Error('Qty pembelian #' + (index + 1) + ' tidak valid');
    if (!isFinite(unitCost) || unitCost < 0 || unitCost > 1000000000) throw new Error('Harga beli #' + (index + 1) + ' tidak valid');
    var lineTotal = qty * unitCost;
    total += lineTotal;
    items.push({inventoryId: inventoryId, inventoryName: String(inv.name || ''), qty: qty, unitCost: unitCost, total: lineTotal});
  });
  var purchase = {
    id: 'PO-' + Utilities.getUuid().slice(0, 8).toUpperCase(), storeId: store.id, supplierId: supplier.id, supplierName: supplier.name,
    invoiceNo: str_(p.invoiceNo, 80), status: 'DRAFT', total: Math.round(total), note: str_(p.note, 300), createdAt: iso_(), receivedAt: '', receivedBy: '', cancelledAt: ''
  };
  appendObject_('Purchases', purchase);
  appendRows_('PurchaseItems', items.map(function(item) { return Object.assign({id: uuid_(), purchaseId: purchase.id}, item); }));
  appendObject_('AuditLog', {
    id: uuid_(), storeId: purchase.storeId, userId: actor.id || 'staff', action: 'CREATE', entity: 'PURCHASE', entityId: purchase.id,
    detail: JSON.stringify({supplier: supplier.name, total: purchase.total, itemCount: items.length}), createdAt: iso_()
  });
  return {ok: true, data: getPurchaseById_(purchase.id)};
}

function receivePurchase_(p) {
  var id = requireId_(p.id);
  var purchase = getObject_('Purchases', id);
  if (!purchase) throw new Error('Pembelian tidak ditemukan');
  assertActorStoreAccess_(purchase, p);
  if (String(purchase.status) !== 'DRAFT') throw new Error('Hanya pembelian DRAFT yang dapat diterima');
  var items = listObjects_('PurchaseItems').filter(function(i) { return String(i.purchaseId) === String(id); });
  if (!items.length) throw new Error('Item pembelian kosong');
  var invById = indexBy_(listObjects_('Inventory'), 'id');
  items.forEach(function(item) {
    if (!invById[String(item.inventoryId)]) throw new Error('Bahan pembelian sudah tidak tersedia: ' + item.inventoryName);
  });
  var actor = actorContext_(p);
  var movements = [];
  items.forEach(function(item) {
    var inventoryId = String(item.inventoryId);
    var inv = invById[inventoryId];
    var row = findRow_('Inventory', inventoryId);
    var before = Number(inv.stock) || 0;
    var qty = Number(item.qty) || 0;
    var unitCost = Number(item.unitCost) || 0;
    var after = before + qty;
    var oldCost = Number(inv.cost) || 0;
    inv.cost = after > 0 ? ((before * oldCost) + (qty * unitCost)) / after : unitCost;
    inv.stock = after;
    inv.updatedAt = iso_();
    updateRow_('Inventory', row, inv);
    movements.push(stockMovementObject_(inv, qty, before, after, 'PURCHASE', 'PURCHASE', id, 'Penerimaan pembelian ' + id, actor, unitCost));
  });
  appendRows_('StockMovements', movements);
  refreshMenuCostsForInventory_(items.map(function(item) { return String(item.inventoryId); }));
  purchase.status = 'RECEIVED';
  purchase.receivedAt = iso_();
  purchase.receivedBy = actor.name || actor.id || 'staff';
  var purchaseRow = findRow_('Purchases', id);
  updateRow_('Purchases', purchaseRow, purchase);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: purchase.storeId, userId: actor.id || 'staff', action: 'RECEIVE', entity: 'PURCHASE', entityId: id,
    detail: JSON.stringify({total: purchase.total, itemCount: items.length}), createdAt: iso_()
  });
  return {ok: true, data: getPurchaseById_(id)};
}

function cancelPurchase_(p) {
  var id = requireId_(p.id);
  var purchase = getObject_('Purchases', id);
  if (!purchase) throw new Error('Pembelian tidak ditemukan');
  assertActorStoreAccess_(purchase, p);
  if (String(purchase.status) !== 'DRAFT') throw new Error('Hanya pembelian DRAFT yang dapat dibatalkan');
  purchase.status = 'CANCELLED';
  purchase.cancelledAt = iso_();
  var row = findRow_('Purchases', id);
  updateRow_('Purchases', row, purchase);
  var actor = actorContext_(p);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: purchase.storeId, userId: actor.id || 'staff', action: 'CANCEL', entity: 'PURCHASE', entityId: id,
    detail: str_(p.reason, 300), createdAt: iso_()
  });
  return {ok: true, data: getPurchaseById_(id)};
}

function getPurchaseById_(id) {
  var purchase = getObject_('Purchases', id);
  if (!purchase) return null;
  purchase.items = listObjects_('PurchaseItems').filter(function(i) { return String(i.purchaseId) === String(id); });
  return purchase;
}

function getPurchases_(p) {
  var limit = Math.min(Math.max(Math.floor(Number(p && p.limit) || 100), 1), 500);
  var status = String(str_(p && p.status, 16)).toUpperCase();
  var storeId = str_(p && p.storeId, 64);
  var rows = listObjects_('Purchases');
  if (storeId) rows = rows.filter(function(r) { return String(r.storeId) === storeId; });
  if (status) rows = rows.filter(function(r) { return String(r.status) === status; });
  rows.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  var itemByPurchase = groupBy_(listObjects_('PurchaseItems'), 'purchaseId');
  return rows.slice(0, limit).map(function(r) { return Object.assign({}, r, {items: itemByPurchase[String(r.id)] || []}); });
}

/** OPNAME menetapkan stok fisik; WASTE mengurangi; ADJUSTMENT memakai delta +/- eksplisit. */
function adjustInventory_(p) {
  var id = requireId_(p.id);
  var inv = getObject_('Inventory', id);
  var row = findRow_('Inventory', id);
  if (!inv || !row) throw new Error('Bahan tidak ditemukan');
  assertActorStoreAccess_(inv, p);
  var type = String(str_(p.type, 16)).toUpperCase();
  if (['OPNAME','WASTE','ADJUSTMENT'].indexOf(type) === -1) throw new Error('Tipe penyesuaian stok tidak valid');
  var reason = str_(p.reason, 300);
  if (!reason) throw new Error('Alasan penyesuaian stok wajib diisi');
  var before = Number(inv.stock) || 0;
  var delta = 0;
  if (type === 'OPNAME') {
    var counted = Number(p.countedStock);
    if (!isFinite(counted) || counted < 0) throw new Error('Stok fisik opname tidak valid');
    delta = counted - before;
  } else if (type === 'WASTE') {
    var wasteQty = Number(p.qty);
    if (!isFinite(wasteQty) || wasteQty <= 0) throw new Error('Qty waste harus lebih dari 0');
    delta = -wasteQty;
  } else {
    delta = Number(p.delta);
    if (!isFinite(delta) || Math.abs(delta) < 1e-9) throw new Error('Delta adjustment tidak valid');
  }
  var after = before + delta;
  if (after < -1e-9) throw new Error('Stok tidak cukup; hasil stok tidak boleh negatif');
  if (after < 0) after = 0;
  inv.stock = after;
  inv.updatedAt = iso_();
  updateRow_('Inventory', row, inv);
  var actor = actorContext_(p);
  appendObject_('StockMovements', stockMovementObject_(inv, delta, before, after, type, 'INVENTORY', id, reason, actor));
  appendObject_('AuditLog', {
    id: uuid_(), storeId: inv.storeId, userId: actor.id || 'staff', action: type, entity: 'INVENTORY', entityId: id,
    detail: JSON.stringify({before: before, delta: delta, after: after, reason: reason}), createdAt: iso_()
  });
  return {ok: true, data: inv};
}

function getStockMovements_(p) {
  var limit = Math.min(Math.max(Math.floor(Number(p && p.limit) || 200), 1), 1000);
  var inventoryId = str_(p && p.inventoryId, 64);
  var type = String(str_(p && p.type, 16)).toUpperCase();
  var storeId = str_(p && p.storeId, 64);
  var rows = listObjects_('StockMovements');
  if (inventoryId) rows = rows.filter(function(r) { return String(r.inventoryId) === inventoryId; });
  if (type) rows = rows.filter(function(r) { return String(r.type) === type; });
  if (storeId) rows = rows.filter(function(r) { return String(r.storeId) === storeId; });
  rows.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return rows.slice(0, limit);
}

function stockMovementObject_(inv, qty, before, after, type, referenceType, referenceId, note, actor, unitCostOverride) {
  var unitCost = unitCostOverride === undefined ? (Number(inv.cost) || 0) : (Number(unitCostOverride) || 0);
  return {
    id: uuid_(), storeId: String(inv.storeId || ''), inventoryId: String(inv.id || ''), inventoryName: String(inv.name || ''), type: String(type || 'ADJUSTMENT'),
    qty: qty, beforeStock: before, afterStock: after, unitCost: unitCost, totalCost: Math.abs(Number(qty) || 0) * unitCost,
    referenceType: String(referenceType || ''), referenceId: String(referenceId || ''), note: str_(note, 300),
    staffId: actor && actor.id ? actor.id : '', staffName: actor && actor.name ? actor.name : '', createdAt: iso_()
  };
}

function refreshMenuCostsForInventory_(inventoryIds) {
  var wanted = {};
  (inventoryIds || []).forEach(function(id) { if (id) wanted[String(id)] = true; });
  if (!Object.keys(wanted).length) return;
  var recipes = listObjects_('Recipes');
  var affected = {};
  recipes.forEach(function(r) { if (wanted[String(r.inventoryId)]) affected[String(r.menuItemId)] = true; });
  if (!Object.keys(affected).length) return;
  var recipesByMenu = groupBy_(recipes, 'menuItemId');
  var invById = indexBy_(listObjects_('Inventory'), 'id');
  Object.keys(affected).forEach(function(menuItemId) {
    var menu = getObject_('Menu', menuItemId);
    var row = findRow_('Menu', menuItemId);
    if (!menu || !row) return;
    menu.cost = Math.round(recipeCostForMenu_(menuItemId, recipesByMenu, invById, Number(menu.cost) || 0));
    menu.updatedAt = iso_();
    updateRow_('Menu', row, menu);
  });
}

function recipeCostForMenu_(menuItemId, recipesByMenu, inventoryById, fallbackCost) {
  var recipes = recipesByMenu[String(menuItemId)] || [];
  if (!recipes.length) return Math.max(0, Number(fallbackCost) || 0);
  var total = 0;
  recipes.forEach(function(recipe) {
    var inv = inventoryById[String(recipe.inventoryId)];
    if (!inv) return;
    total += Math.max(0, Number(recipe.qty) || 0) * Math.max(0, Number(inv.cost) || 0);
  });
  return total;
}

/* ---------------- Laporan ---------------- */

/**
 * Rekap penjualan untuk dashboard & halaman laporan.
 * range: 'today' | '7d' | '30d'. Hanya order PAID masuk angka penjualan;
 * unpaid dipisahkan sebagai outstanding dan REFUNDED dilaporkan terpisah.
 */
function getReport_(p) {
  var range = String(str_(p && p.range, 8) || 'today').toLowerCase();
  var now = new Date();
  var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'Asia/Jakarta';
  var todayKey = formatDateKey_(now, tz);
  var storeId = effectiveStoreId_(p || {});
  var allOrders = listObjects_('Orders');
  if (storeId) allOrders = allOrders.filter(function(o) { return String(o.storeId || '') === String(storeId); });
  var inRange;
  if (range === '7d' || range === '30d') {
    var days = range === '7d' ? 7 : 30;
    var since = now.getTime() - days * 24 * 3600 * 1000;
    inRange = allOrders.filter(function(o) { var t = Date.parse(String(o.createdAt)); return isFinite(t) && t >= since; });
  } else {
    inRange = allOrders.filter(function(o) { return dateKeyOf_(o.createdAt, tz) === todayKey; });
  }

  var grossSales = 0, discountTotal = 0, taxTotal = 0, serviceTotal = 0, netSales = 0;
  var outstandingSales = 0, refundedSales = 0, refundCount = 0;
  var paymentMix = {}, statusCount = {}, byDay = {}, paidOrderIds = {};
  var paymentsByOrder = groupBy_(listObjects_('Payments'), 'orderId');
  var paidCount = 0;
  inRange.forEach(function(o) {
    var status = String(o.status).toUpperCase();
    var total = Number(o.total) || 0;
    statusCount[status] = (statusCount[status] || 0) + 1;
    if (status === 'PAID') {
      paidCount += 1;
      grossSales += Number(o.subtotal) || 0;
      discountTotal += Number(o.discount) || 0;
      taxTotal += Number(o.tax) || 0;
      serviceTotal += Number(o.service) || 0;
      netSales += total;
      paidOrderIds[String(o.id)] = true;
      var paymentRows = paymentsByOrder[String(o.id)] || [];
      if (paymentRows.length) {
        paymentRows.forEach(function(pay) {
          var method = String(pay.method || 'UNKNOWN');
          paymentMix[method] = (paymentMix[method] || 0) + (Number(pay.amount) || 0);
        });
      } else {
        var method = String(o.paymentMethod || 'UNKNOWN');
        paymentMix[method] = (paymentMix[method] || 0) + total;
      }
      var key = range === '7d' || range === '30d' ? dateKeyOf_(o.createdAt, tz) : todayKey;
      byDay[key] = (byDay[key] || 0) + total;
    } else if (status === 'REFUNDED') {
      refundCount += 1;
      refundedSales += Number(o.refundedAmount) || total;
    } else if (status !== 'CANCELLED') {
      outstandingSales += total;
    }
  });

  var topMap = {};
  var cogs = 0;
  if (Object.keys(paidOrderIds).length) {
    listObjects_('OrderItems').forEach(function(item) {
      if (!paidOrderIds[String(item.orderId)]) return;
      var name = String(item.name || item.menuItemId);
      var qty = Number(item.qty) || 0;
      var entry = topMap[name] = topMap[name] || {name: name, qty: 0, revenue: 0};
      entry.qty += qty;
      entry.revenue += (Number(item.price) || 0) * qty;
      cogs += (Number(item.cost) || 0) * qty;
    });
  }
  var topItems = Object.keys(topMap).map(function(k) { return topMap[k]; });
  topItems.sort(function(a, b) { return b.qty - a.qty; });
  topItems = topItems.slice(0, 10);

  var dayCount = range === '30d' ? 30 : range === '7d' ? 7 : 1;
  var series = [];
  for (var i = dayCount - 1; i >= 0; i--) {
    var key2 = formatDateKey_(new Date(now.getTime() - i * 24 * 3600 * 1000), tz);
    series.push({date: key2, total: byDay[key2] || 0});
  }
  return {
    range: range === '7d' ? '7d' : range === '30d' ? '30d' : 'today',
    orderCount: paidCount,
    totalOrders: inRange.length,
    grossSales: grossSales,
    discount: discountTotal,
    tax: taxTotal,
    service: serviceTotal,
    netSales: netSales,
    outstandingSales: outstandingSales,
    refundedSales: refundedSales,
    refundCount: refundCount,
    avgCheck: paidCount ? Math.round(netSales / paidCount) : 0,
    cogs: Math.round(cogs),
    grossProfit: Math.round((grossSales - discountTotal) - cogs),
    grossMargin: (grossSales - discountTotal) > 0 ? Math.round((((grossSales - discountTotal) - cogs) / (grossSales - discountTotal)) * 10000) / 100 : 0,
    paymentMix: paymentMix,
    statusCount: statusCount,
    topItems: topItems,
    series: series
  };
}

function dateKeyOf_(value, tz) {
  var t = Date.parse(String(value));
  if (!isFinite(t)) return '';
  return formatDateKey_(new Date(t), tz);
}

function formatDateKey_(date, tz) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  }
  return date.toISOString().slice(0, 10);
}


/* ---------------- Stage 6: Multi Outlet, Owner, Analytics, Sync & Subscription ---------------- */

var SUBSCRIPTION_GATED_ACTIONS = {
  createOrder:true, updateOrderStatus:true, payOrder:true, refundOrder:true, splitOrder:true,
  openShift:true, closeShift:true, saveMenu:true, saveCategory:true, saveTable:true, saveInventory:true,
  savePromotion:true, saveVoucher:true, saveSupplier:true, saveRecipe:true, createPurchase:true,
  receivePurchase:true, cancelPurchase:true, adjustInventory:true, saveReservation:true, saveCustomer:true,
  saveStaff:true, saveSettings:true, saveStore:true, deleteData:true, deleteMenu:true
};

function scopePayloadToActor_(input) {
  var p = Object.assign({}, input || {});
  var role = String(str_(p._actorRole, 20)).toLowerCase();
  var actorStore = str_(p._actorStoreId, 64);
  if (actorStore && (role !== 'admin' || !str_(p.storeId, 64))) p.storeId = actorStore;
  return p;
}

function effectiveStoreId_(p) {
  p = p || {};
  var role = String(str_(p._actorRole, 20)).toLowerCase();
  var actorStore = str_(p._actorStoreId, 64);
  var requested = str_(p.storeId, 64);
  if (role && role !== 'admin' && actorStore) return String(resolveStore_(actorStore).id || actorStore);
  return String(resolveStore_(requested || actorStore || '').id || requested || actorStore || '');
}

function assertActorStoreAccess_(row, p) {
  if (!row) return;
  var role = String(str_(p && p._actorRole, 20)).toLowerCase();
  var actorStore = str_(p && p._actorStoreId, 64);
  if (role && role !== 'admin' && actorStore && row.storeId && String(row.storeId) !== String(actorStore)) {
    throw new Error('Data outlet lain tidak dapat diakses oleh role ini');
  }
}

function scopedList_(sheetName, p) {
  var storeId = effectiveStoreId_(p || {});
  var rows = listObjects_(sheetName);
  if (storeId && HEADERS[sheetName] && HEADERS[sheetName].indexOf('storeId') !== -1) {
    rows = rows.filter(function(row) { return String(row.storeId || '') === String(storeId); });
  }
  return rows;
}

function getStores_(p) {
  var role = String(str_(p && p._actorRole, 20)).toLowerCase();
  var actorStore = str_(p && p._actorStoreId, 64);
  var stores = listObjects_('Stores').filter(isActive_);
  if (role && role !== 'admin' && actorStore) stores = stores.filter(function(s) { return String(s.id) === String(actorStore); });
  stores.sort(function(a,b){ return String(a.name || '').localeCompare(String(b.name || '')); });
  return stores;
}

function saveStore_(p) {
  var actor = actorContext_(p);
  if (String(actor.role || '').toLowerCase() !== 'admin') throw new Error('Hanya Owner/Admin yang dapat mengelola outlet');
  var id = str_(p.id,64);
  var existing = id ? getObject_('Stores', id) : null;
  if (!existing) {
    var sub = getSubscription_();
    var activeCount = listObjects_('Stores').filter(isActive_).length;
    if (activeCount >= Number(sub.maxOutlets || 1)) throw new Error('Batas outlet paket tercapai (' + sub.maxOutlets + ')');
  }
  var name = str_(p.name,120);
  if (!name) throw new Error('Nama outlet wajib diisi');
  var slug = str_(p.slug,64).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || ('outlet-' + (listObjects_('Stores').length + 1));
  var duplicate = listObjects_('Stores').some(function(s){ return String(s.id)!==String(id||'') && String(s.slug||'').toLowerCase()===slug; });
  if (duplicate) throw new Error('Slug outlet sudah digunakan');
  var base = existing || {};
  var item = {
    id: id || ('store-' + Utilities.getUuid().replace(/[^a-z0-9]/gi,'').slice(0,8).toLowerCase()),
    name:name, slug:slug,
    phone: p.phone === undefined ? String(base.phone||'') : str_(p.phone,24).replace(/[^0-9+]/g,''),
    address: p.address === undefined ? String(base.address||'') : str_(p.address,300),
    taxRate: p.taxRate === undefined ? numberOr_(base.taxRate,0) : Math.max(0,Number(p.taxRate)||0),
    serviceRate: p.serviceRate === undefined ? numberOr_(base.serviceRate,0) : Math.max(0,Number(p.serviceRate)||0),
    createdAt: base.createdAt || iso_(),
    loyaltyEnabled: p.loyaltyEnabled === undefined ? (base.loyaltyEnabled === '' ? true : base.loyaltyEnabled) : !(p.loyaltyEnabled===false || String(p.loyaltyEnabled).toLowerCase()==='false'),
    loyaltySpendPerPoint: p.loyaltySpendPerPoint === undefined ? numberOr_(base.loyaltySpendPerPoint,10000) : Math.max(1,Math.round(Number(p.loyaltySpendPerPoint)||10000)),
    loyaltyPointValue: p.loyaltyPointValue === undefined ? numberOr_(base.loyaltyPointValue,100) : Math.max(1,Math.round(Number(p.loyaltyPointValue)||100)),
    maxRedeemPercent: p.maxRedeemPercent === undefined ? numberOr_(base.maxRedeemPercent,30) : Math.min(100,Math.max(0,Number(p.maxRedeemPercent)||0)),
    active: p.active === false || String(p.active).toLowerCase()==='false' ? false : true
  };
  var row=findRow_('Stores',item.id); if(row) updateRow_('Stores',row,item); else appendObject_('Stores',item);
  appendObject_('AuditLog',{id:uuid_(),storeId:item.id,userId:actor.id||'admin',action:existing?'UPDATE':'CREATE',entity:'STORE',entityId:item.id,detail:JSON.stringify({name:item.name,slug:item.slug,active:item.active}),createdAt:iso_()});
  return {ok:true,data:item};
}

function getOwnerDashboard_(p) {
  var role=String(str_(p&&p._actorRole,20)).toLowerCase();
  if (role && role !== 'admin') throw new Error('Owner Dashboard hanya untuk Admin');
  var range=String(str_(p&&p.range,8)||'30d').toLowerCase();
  if (['today','7d','30d'].indexOf(range)===-1) range='30d';
  var stores=listObjects_('Stores').filter(isActive_);
  var totals={netSales:0,cogs:0,grossProfit:0,orders:0,outstanding:0,refunds:0};
  var outlets=stores.map(function(store){
    var report=getReport_({range:range,storeId:store.id,_actorRole:'admin'});
    var inv=listObjects_('Inventory').filter(function(i){return String(i.storeId)===String(store.id);});
    var low=inv.filter(function(i){return Number(i.stock)<=Number(i.parLevel);}).length;
    totals.netSales+=Number(report.netSales)||0; totals.cogs+=Number(report.cogs)||0; totals.grossProfit+=Number(report.grossProfit)||0;
    totals.orders+=Number(report.orderCount)||0; totals.outstanding+=Number(report.outstandingSales)||0; totals.refunds+=Number(report.refundedSales)||0;
    return {storeId:store.id,name:store.name,slug:store.slug,netSales:report.netSales,orders:report.orderCount,avgCheck:report.avgCheck,cogs:report.cogs,grossProfit:report.grossProfit,grossMargin:report.grossMargin,outstanding:report.outstandingSales,refunds:report.refundedSales,lowStock:low};
  });
  totals.grossMargin=(totals.netSales>0?Math.round((totals.grossProfit/totals.netSales)*10000)/100:0);
  return {range:range,totals:totals,outlets:outlets,generatedAt:iso_()};
}

function getAdvancedAnalytics_(p) {
  var storeId=effectiveStoreId_(p||{});
  var days=Math.min(90,Math.max(7,Math.floor(Number(p&&p.days)||30)));
  var since=Date.now()-days*86400000;
  var orders=listObjects_('Orders').filter(function(o){return String(o.storeId)===String(storeId)&&String(o.status)==='PAID'&&Date.parse(String(o.createdAt))>=since;});
  var orderIds={}; orders.forEach(function(o){orderIds[String(o.id)]=o;});
  var hourly={},weekday={},channel={},staff={},customerCount={};
  var weekdayNames=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  orders.forEach(function(o){
    var d=new Date(String(o.createdAt)); var hour=isFinite(d.getTime())?String(d.getHours()).padStart(2,'0')+':00':'?'; hourly[hour]=(hourly[hour]||0)+(Number(o.total)||0);
    var wd=isFinite(d.getTime())?weekdayNames[d.getDay()]:'?'; weekday[wd]=(weekday[wd]||0)+(Number(o.total)||0);
    var ch=String(o.channel||'UNKNOWN'); channel[ch]=(channel[ch]||0)+(Number(o.total)||0);
    var st=String(o.staffName||'Tanpa staff'); staff[st]=(staff[st]||0)+(Number(o.total)||0);
    var phone=String(o.phone||''); if(phone) customerCount[phone]=(customerCount[phone]||0)+1;
  });
  var menuById=indexBy_(listObjects_('Menu').filter(function(m){return String(m.storeId)===String(storeId);}), 'id');
  var catById=indexBy_(listObjects_('Categories').filter(function(c){return String(c.storeId)===String(storeId);}), 'id');
  var category={};
  listObjects_('OrderItems').forEach(function(item){
    if(!orderIds[String(item.orderId)]) return; var menu=menuById[String(item.menuItemId)]||{}; var cat=catById[String(menu.categoryId)]||{}; var name=String(cat.name||'Lainnya');
    category[name]=(category[name]||0)+(Number(item.price)||0)*(Number(item.qty)||0);
  });
  var repeat=Object.keys(customerCount).filter(function(k){return customerCount[k]>1;}).length;
  var unique=Object.keys(customerCount).length;
  function pairs_(map){return Object.keys(map).map(function(k){return {label:k,value:map[k]};}).sort(function(a,b){return b.value-a.value;});}
  return {storeId:storeId,days:days,paidOrders:orders.length,uniqueCustomers:unique,repeatCustomers:repeat,repeatRate:unique?Math.round((repeat/unique)*10000)/100:0,hourly:pairs_(hourly),weekday:pairs_(weekday),channel:pairs_(channel),staff:pairs_(staff),category:pairs_(category),generatedAt:iso_()};
}

function getSyncState_(p) {
  var storeId=effectiveStoreId_(p||{});
  var audit=listObjects_('AuditLog').filter(function(a){return String(a.storeId||'')===String(storeId);});
  audit.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});
  return {storeId:storeId,serverTime:iso_(),lastChangeAt:audit.length?String(audit[0].createdAt||''):'',counts:{orders:scopedList_('Orders',{storeId:storeId,_actorRole:'admin'}).length,menu:scopedList_('Menu',{storeId:storeId,_actorRole:'admin'}).length,customers:scopedList_('Customers',{storeId:storeId,_actorRole:'admin'}).length,inventory:scopedList_('Inventory',{storeId:storeId,_actorRole:'admin'}).length},mode:'GAS_CLOUD_SOURCE_OF_TRUTH'};
}

function exportBackup_(p) {
  var storeId=effectiveStoreId_(p||{});
  var store=resolveStore_(storeId);
  var direct=['Tables','Categories','Menu','Orders','Customers','Reservations','Inventory','Promotions','Vouchers','Payments','LoyaltyTransactions','Suppliers','Purchases','Recipes','StockMovements','Staff','Shifts','AuditLog'];
  var data={}; direct.forEach(function(name){data[name]=listObjects_(name).filter(function(r){return String(r.storeId||'')===String(storeId);});});
  var orderIds={}; data.Orders.forEach(function(o){orderIds[String(o.id)]=true;});
  var purchaseIds={}; data.Purchases.forEach(function(o){purchaseIds[String(o.id)]=true;});
  data.OrderItems=listObjects_('OrderItems').filter(function(r){return orderIds[String(r.orderId)];});
  data.OrderIngredientUsage=listObjects_('OrderIngredientUsage').filter(function(r){return orderIds[String(r.orderId)];});
  data.PurchaseItems=listObjects_('PurchaseItems').filter(function(r){return purchaseIds[String(r.purchaseId)];});
  var payload={format:'KASTRIVA_POS_BACKUP_V1',version:1,exportedAt:iso_(),store:store,data:data};
  var raw=JSON.stringify(payload); var digest=Utilities.computeDigest(raw,Utilities.Charset.UTF_8,Utilities.DigestAlgorithm.SHA_256); var hex=''; for(var i=0;i<digest.length;i++){var v=digest[i];if(v<0)v+=256;hex+=('0'+v.toString(16)).slice(-2);} payload.checksum='sha256:'+hex;
  return payload;
}

function ensureSubscription_() {
  ensureHeaders_('Subscriptions');
  var existing=getObject_('Subscriptions','installation');
  if(existing) {
    if (!String(existing.installationId || '')) {
      existing.installationId='INST-' + Utilities.getUuid().replace(/[^a-z0-9]/gi,'').slice(0,16).toUpperCase();
      existing.updatedAt=iso_();
      var existingRow=findRow_('Subscriptions','installation');
      if(existingRow) updateRow_('Subscriptions',existingRow,existing);
    }
    return existing;
  }
  var start=new Date(); var end=new Date(start.getTime()+14*86400000);
  var row={id:'installation',plan:'TRIAL',status:'TRIAL',trialStart:start.toISOString(),trialEnd:end.toISOString(),activeUntil:'',maxOutlets:2,licenseId:'',updatedAt:iso_(),installationId:'INST-' + Utilities.getUuid().replace(/[^a-z0-9]/gi,'').slice(0,16).toUpperCase()};
  appendObject_('Subscriptions',row); return row;
}

function getSubscription_() {
  var row=ensureSubscription_(); var now=Date.now(); var trialEnd=Date.parse(String(row.trialEnd||'')); var activeUntil=Date.parse(String(row.activeUntil||''));
  var active=isFinite(activeUntil)&&activeUntil>now; var trial=!active&&isFinite(trialEnd)&&trialEnd>now&&String(row.status||'').toUpperCase()!=='CANCELLED';
  var status=active?'ACTIVE':trial?'TRIAL':'EXPIRED'; var until=active?activeUntil:trial?trialEnd:Math.max(activeUntil||0,trialEnd||0);
  return Object.assign({},row,{status:status,daysRemaining:until>now?Math.ceil((until-now)/86400000):0,isActive:status==='ACTIVE'||status==='TRIAL'});
}

function assertSubscriptionForAction_(action) {
  if(!SUBSCRIPTION_GATED_ACTIONS[action]) return;
  var sub=getSubscription_(); if(!sub.isActive) throw new Error('Langganan Kastriva POS Pro sudah berakhir. Aktifkan paket untuk melanjutkan transaksi.');
}

function applySubscription_(p) {
  if(p._licenseVerified!==true) throw new Error('Lisensi belum diverifikasi server');
  var actor=actorContext_(p); if(String(actor.role||'').toLowerCase()!=='admin') throw new Error('Hanya Owner/Admin yang dapat mengaktifkan lisensi');
  var current=ensureSubscription_();
  var installationId=str_(p.installationId,80);
  if(!installationId || installationId!==String(current.installationId||'')) throw new Error('Lisensi dibuat untuk instalasi yang berbeda');
  var plan=String(str_(p.plan,20)||'PRO').toUpperCase(); if(['STARTER','PRO','BUSINESS'].indexOf(plan)===-1) throw new Error('Plan lisensi tidak valid');
  var activeUntil=str_(p.activeUntil,40); if(!isFinite(Date.parse(activeUntil))||Date.parse(activeUntil)<=Date.now()) throw new Error('Masa aktif lisensi tidak valid');
  var maxOutlets=Math.min(100,Math.max(1,Math.floor(Number(p.maxOutlets)||1)));
  var next={id:'installation',plan:plan,status:'ACTIVE',trialStart:current.trialStart||iso_(),trialEnd:current.trialEnd||'',activeUntil:activeUntil,maxOutlets:maxOutlets,licenseId:str_(p.licenseId,100),updatedAt:iso_(),installationId:String(current.installationId||installationId)};
  var row=findRow_('Subscriptions','installation'); if(row) updateRow_('Subscriptions',row,next); else appendObject_('Subscriptions',next);
  return {ok:true,data:getSubscription_()};
}

/* ---------------- Pengaturan ---------------- */

/** Subset pengaturan yang aman untuk dikonsumsi halaman publik. */
function getPublicSettings_(p) {
  var store = resolveStore_(effectiveStoreId_(p || {}));
  return {
    storeId: store.id || '',
    storeName: String(store.name || ''),
    phone: String(store.phone || ''),
    address: String(store.address || ''),
    taxRate: numberOr_(store.taxRate, 0),
    serviceRate: numberOr_(store.serviceRate, 0),
    loyaltyEnabled: loyaltyConfig_(store).enabled,
    loyaltySpendPerPoint: loyaltyConfig_(store).spendPerPoint,
    loyaltyPointValue: loyaltyConfig_(store).pointValue,
    maxRedeemPercent: loyaltyConfig_(store).maxRedeemPercent
  };
}

function saveSettings_(p) {
  var store = resolveStore_(effectiveStoreId_(p || {}));
  var row = findRow_('Stores', store.id);
  var next = {
    id: store.id,
    name: str_(p.name, 120) || String(store.name || ''),
    slug: String(store.slug || ''),
    phone: p.phone === undefined ? String(store.phone || '') : str_(p.phone, 20).replace(/[^0-9+]/g, ''),
    address: p.address === undefined ? String(store.address || '') : str_(p.address, 300),
    taxRate: p.taxRate === undefined || p.taxRate === '' ? numberOr_(store.taxRate, 0) : Math.max(0, Number(p.taxRate) || 0),
    serviceRate: p.serviceRate === undefined || p.serviceRate === '' ? numberOr_(store.serviceRate, 0) : Math.max(0, Number(p.serviceRate) || 0),
    loyaltyEnabled: p.loyaltyEnabled === undefined ? loyaltyConfig_(store).enabled : !(p.loyaltyEnabled === false || String(p.loyaltyEnabled).toLowerCase() === 'false'),
    loyaltySpendPerPoint: p.loyaltySpendPerPoint === undefined ? loyaltyConfig_(store).spendPerPoint : Math.max(1, Math.round(Number(p.loyaltySpendPerPoint) || 10000)),
    loyaltyPointValue: p.loyaltyPointValue === undefined ? loyaltyConfig_(store).pointValue : Math.max(1, Math.round(Number(p.loyaltyPointValue) || 100)),
    maxRedeemPercent: p.maxRedeemPercent === undefined ? loyaltyConfig_(store).maxRedeemPercent : Math.min(100, Math.max(0, Number(p.maxRedeemPercent) || 0)),
    createdAt: store.createdAt || iso_()
  };
  if (row) updateRow_('Stores', row, next);
  else appendObject_('Stores', next);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: next.id,
    userId: actorContext_(p).id || str_(p.userId, 64) || 'staff',
    action: 'UPDATE',
    entity: 'SETTINGS',
    entityId: next.id,
    detail: JSON.stringify({name: next.name, taxRate: next.taxRate, serviceRate: next.serviceRate, loyaltyEnabled: next.loyaltyEnabled, loyaltySpendPerPoint: next.loyaltySpendPerPoint, loyaltyPointValue: next.loyaltyPointValue, maxRedeemPercent: next.maxRedeemPercent}),
    createdAt: iso_()
  });
  return {ok: true, data: next};
}

/* ---------------- Sheet helpers ---------------- */

/** Menambahkan kolom schema yang hilang tanpa menghapus atau menggeser data lama. */
function ensureHeaders_(sheetName) {
  var sh = sheet_(sheetName);
  var expected = HEADERS[sheetName] || [];
  if (!expected.length) return;
  if (sh.getLastRow() === 0) {
    sh.appendRow(expected);
    return;
  }
  var width = Math.max(sh.getLastColumn(), 1);
  var current = sh.getRange(1, 1, 1, width).getValues()[0].map(function(v) { return String(v); });
  var missing = expected.filter(function(h) { return current.indexOf(h) === -1; });
  if (missing.length) sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
}

function listObjects_(sheetName) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  var headers = HEADERS[sheetName];
  if (lastRow < 2) return [];
  var values = sh.getRange(1, 1, lastRow, Math.max(sh.getLastColumn(), headers.length)).getValues();
  var sheetHeaders = values[0].map(function(h) { return String(h); });
  return values.slice(1)
    .filter(function(row) { return row.join('') !== ''; })
    .map(function(row) { return rowToObject_(sheetHeaders, row); });
}

/** Menu siap pakai client: kategori berupa nama (bukan id), hanya yang aktif. */
function listMenuForClient_(p) {
  var storeId = effectiveStoreId_(p || {});
  var categories = listObjects_('Categories').filter(function(c) { return !storeId || String(c.storeId || '') === String(storeId); });
  var catById = indexBy_(categories, 'id');
  return listObjects_('Menu').filter(function(m) {
    return isActive_(m) && (!storeId || String(m.storeId || '') === String(storeId));
  }).map(function(m) {
    var out = Object.assign({}, m);
    var cat = catById[String(m.categoryId)];
    out.category = cat ? String(cat.name) : '';
    return out;
  });
}

function rowToObject_(headers, row) {
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    if (!headers[i]) continue;
    out[headers[i]] = normalize_(row[i]);
  }
  return out;
}

function getObject_(sheetName, id) {
  if (!id) return null;
  var row = findRow_(sheetName, id);
  if (!row) return null;
  var sh = sheet_(sheetName);
  var width = Math.max(sh.getLastColumn(), HEADERS[sheetName].length);
  var headers = sh.getRange(1, 1, 1, width).getValues()[0].map(function(h) { return String(h); });
  return rowToObject_(headers, sh.getRange(row, 1, 1, width).getValues()[0]);
}

function upsertObject_(sheetName, p) {
  var id = str_(p.id, 64) || uuid_();
  p.id = id;
  if (HEADERS[sheetName] && HEADERS[sheetName].indexOf('storeId') !== -1) p.storeId = effectiveStoreId_(p) || p.storeId || '';
  var row = findRow_(sheetName, id);
  if (row) { var existing = getObject_(sheetName, id); assertActorStoreAccess_(existing, p); updateRow_(sheetName, row, p); }
  else appendObject_(sheetName, p);
  return {ok: true, data: getObject_(sheetName, id)};
}

function appendObject_(sheetName, p) {
  var headers = HEADERS[sheetName];
  var row = headers.map(function(h) { return p[h] !== undefined && p[h] !== null ? p[h] : ''; });
  sheet_(sheetName).appendRow(row);
  return {ok: true, data: p};
}

/** Menulis banyak baris dalam satu operasi: jauh lebih cepat dari appendRow berulang. */
function appendRows_(sheetName, objects) {
  if (!objects || !objects.length) return {ok: true, data: []};
  var headers = HEADERS[sheetName];
  var sh = sheet_(sheetName);
  var rows = objects.map(function(p) {
    return headers.map(function(h) { return p[h] !== undefined && p[h] !== null ? p[h] : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return {ok: true, data: objects};
}

function updateRow_(sheetName, row, p) {
  var headers = HEADERS[sheetName];
  var sh = sheet_(sheetName);
  var old = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  var next = headers.map(function(h, i) { return p[h] !== undefined && p[h] !== null ? p[h] : old[i]; });
  sh.getRange(row, 1, 1, headers.length).setValues([next]);
}

function deleteObject_(sheetName, id) {
  var row = findRow_(sheetName, id);
  if (!row) throw new Error('Data tidak ditemukan: ' + id);
  sheet_(sheetName).deleteRow(row);
  return {ok: true, data: {id: id}};
}

function deleteData_(p) {
  var sheetName = String(str_(p.sheet, 32));
  if (!DELETABLE_SHEETS[sheetName]) throw new Error('Sheet tidak boleh dihapus lewat API: ' + sheetName);
  var targetId = requireId_(p.id);
  var target = getObject_(sheetName, targetId);
  if (!target) throw new Error('Data tidak ditemukan: ' + targetId);
  assertActorStoreAccess_(target, p);
  if (sheetName === 'Inventory') {
    var usedByRecipe = listObjects_('Recipes').some(function(r) { return String(r.inventoryId) === String(targetId); });
    if (usedByRecipe) throw new Error('Bahan masih dipakai Recipe/BOM. Hapus dari resep terlebih dahulu.');
  }
  var result = deleteObject_(sheetName, targetId);
  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: str_(p.storeId, 64),
    userId: actorContext_(p).id || str_(p.userId, 64) || 'staff',
    action: 'DELETE',
    entity: sheetName.toUpperCase(),
    entityId: String(result.data.id),
    detail: '',
    createdAt: iso_()
  });
  return result;
}

function findRow_(sheetName, id) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var values = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 2;
  }
  return null;
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ada. Jalankan setupDatabase().');
  return sh;
}

function getSetting_(key) {
  var rows = listObjects_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) return rows[i].value;
  }
  return '';
}

/* ---------------- Normalizer ---------------- */

function saveMenu_(p) {
  ensureHeaders_('Menu');
  var existing = p.id ? getObject_('Menu', str_(p.id,64)) : null;
  if (existing) assertActorStoreAccess_(existing, p);
  var out = normalizeMenu_(p);
  var store = resolveStore_(effectiveStoreId_(p));
  out.storeId = String(store.id || '');
  if (out.barcode) {
    var duplicate = listObjects_('Menu').filter(function(item) {
      return String(item.id) !== String(out.id || '') &&
        String(item.storeId || '') === String(out.storeId || '') &&
        normalizeBarcode_(item.barcode) === out.barcode;
    })[0];
    if (duplicate) throw new Error('Barcode sudah dipakai menu: ' + String(duplicate.name || duplicate.id));
  }
  return upsertObject_('Menu', out);
}

function normalizeBarcode_(value) {
  return str_(value, 64).replace(/\s+/g, '').toUpperCase();
}

function normalizeMenu_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama menu wajib diisi');
  out.price = Math.max(0, Number(p.price) || 0);
  out.cost = Math.max(0, Number(p.cost) || 0);
  out.stock = p.stock === '' || p.stock === null || p.stock === undefined ? '' : Number(p.stock) || 0;
  out.categoryId = str_(p.categoryId, 64);
  out.emoji = str_(p.emoji, 8);
  out.description = str_(p.description, 300);
  out.barcode = normalizeBarcode_(p.barcode);
  out.active = p.active === false || p.active === 'false' ? false : true;
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeCategory_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 60);
  if (!out.name) throw new Error('Nama kategori wajib diisi');
  out.sortOrder = Number(p.sortOrder) || 99;
  out.active = p.active === false || p.active === 'false' ? false : true;
  return out;
}

function normalizeTable_(p) {
  var out = Object.assign({}, p);
  out.code = str_(p.code, 32).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out.code) throw new Error('Kode meja wajib diisi');
  out.seats = Math.max(1, Math.floor(Number(p.seats)) || 4);
  var status = String(str_(p.status, 16)).toUpperCase();
  out.status = ['AVAILABLE', 'OCCUPIED', 'RESERVED'].indexOf(status) !== -1 ? status : 'AVAILABLE';
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeInventory_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama bahan wajib diisi');
  out.unit = str_(p.unit, 16) || 'pcs';
  out.stock = Number(p.stock) || 0;
  out.parLevel = Number(p.parLevel) || 0;
  out.cost = Math.max(0, Number(p.cost) || 0);
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeReservation_(p) {
  var out = Object.assign({}, p);
  out.guestName = str_(p.guestName, 80);
  if (!out.guestName) throw new Error('Nama tamu wajib diisi');
  out.phone = str_(p.phone, 20).replace(/[^0-9+]/g, '');
  out.partySize = Math.max(1, Math.floor(Number(p.partySize)) || 2);
  out.reservedAt = str_(p.reservedAt, 32);
  var status = String(str_(p.status, 16)).toUpperCase();
  out.status = RESERVATION_STATUSES.indexOf(status) !== -1 ? status : 'BOOKED';
  out.note = str_(p.note, 300);
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeCustomer_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 80);
  if (!out.name) throw new Error('Nama pelanggan wajib diisi');
  out.phone = str_(p.phone, 20).replace(/[^0-9+]/g, '');
  var tier = String(str_(p.tier, 16)).toUpperCase();
  out.tier = ['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'].indexOf(tier) !== -1 ? tier : 'MEMBER';
  out.memberCode = str_(out.memberCode, 32) || (p.id ? '' : 'KAS-' + Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase());
  out.points = Math.max(0, Math.floor(Number(out.points) || 0));
  out.lifetimePoints = Math.max(out.points, Math.floor(Number(out.lifetimePoints) || 0));
  out.lastVisitAt = str_(out.lastVisitAt, 32);
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

/**
 * PIN kasir disimpan sebagai hash SHA-256 + prefix, tidak pernah sebagai teks polos.
 * Kosong pada update berarti PIN lama dipertahankan.
 */
function hashPin_(pin) {
  var digest = Utilities.computeDigest('kastriva-pin:' + String(pin), Utilities.Charset.UTF_8, Utilities.DigestAlgorithm.SHA_256);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var v = (digest[i] + 256) % 256;
    hex += ('0' + v.toString(16)).slice(-2);
  }
  return 'sha256$' + hex;
}

function normalizeStaff_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 80);
  if (!out.name) throw new Error('Nama staff wajib diisi');
  out.role = str_(p.role, 32) || 'Kasir';
  var pin = str_(p.pin, 12);
  if (pin) {
    if (!/^[0-9]{4,8}$/.test(pin)) throw new Error('PIN harus 4-8 digit angka');
    out.pinHash = hashPin_(pin);
  } else if (p.pinHash) {
    out.pinHash = str_(p.pinHash, 128);
  }
  out.active = p.active === false || p.active === 'false' ? false : true;
  if (!p.id) out.createdAt = iso_();
  delete out.pin; // PIN polos tidak boleh tersimpan
  return out;
}

function stripPin_(staff) {
  var out = Object.assign({}, staff);
  out.hasPin = Boolean(out.pinHash);
  delete out.pinHash;
  return out;
}


/* ---------------- Staff auth & Shift ---------------- */

function roleKey_(role) {
  var r = String(role || '').trim().toLowerCase();
  if (r === 'manager') return 'manager';
  if (r === 'kasir' || r === 'cashier') return 'cashier';
  if (r === 'kitchen' || r === 'dapur') return 'kitchen';
  if (r === 'waiter' || r === 'pelayan') return 'waiter';
  if (r === 'barista') return 'barista';
  if (r === 'admin') return 'admin';
  return 'staff';
}

function actorContext_(p) {
  p = p || {};
  return {
    id: str_(p._actorId, 64),
    name: str_(p._actorName, 80),
    role: roleKey_(p._actorRole),
    storeId: str_(p._actorStoreId, 64)
  };
}

function secureEqualString_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function listStaffForLogin_() {
  var stores=indexBy_(listObjects_('Stores'), 'id');
  return listObjects_('Staff')
    .filter(function(s) { return isActive_(s) && String(s.pinHash || '') !== ''; })
    .map(function(s) {
      var store=stores[String(s.storeId||'')]||{};
      return {id:String(s.id), name:String(s.name||''), role:String(s.role||'Staff'), storeId:String(s.storeId||''), storeName:String(store.name||'')};
    })
    .sort(function(a, b) { return (a.storeName + ' ' + a.name).localeCompare(b.storeName + ' ' + b.name); });
}

function verifyStaffPin_(p) {
  var staffId = str_(p && p.staffId, 64);
  var pin = str_(p && p.pin, 12);
  if (!staffId || !/^[0-9]{4,8}$/.test(pin)) throw new Error('Staff atau PIN tidak valid');
  var staff = getObject_('Staff', staffId);
  if (!staff || !isActive_(staff) || !staff.pinHash) throw new Error('Staff atau PIN tidak valid');
  if (!secureEqualString_(String(staff.pinHash), hashPin_(pin))) throw new Error('Staff atau PIN tidak valid');
  return {id: String(staff.id), storeId: String(staff.storeId || ''), name: String(staff.name || ''), role: roleKey_(staff.role)};
}

function currentOpenShiftForStaff_(staffId) {
  if (!staffId) return null;
  var rows = listObjects_('Shifts').filter(function(s) {
    return String(s.staffId) === String(staffId) && String(s.status).toUpperCase() === 'OPEN';
  });
  rows.sort(function(a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
  return rows[0] || null;
}

function requireOpenShiftForActor_(actor, storeId) {
  if (!actor || !actor.id || actor.role === 'admin') return null;
  // Kitchen/barista/waiter tetap memiliki shift kehadiran. Untuk aksi finansial
  // create/pay, role tanpa shift akan ditolak agar transaksi dapat diaudit.
  var shift = currentOpenShiftForStaff_(actor.id);
  if (!shift) throw new Error('Shift belum dibuka. Buka shift terlebih dahulu.');
  if (storeId && shift.storeId && String(shift.storeId) !== String(storeId)) throw new Error('Shift aktif berada di store berbeda');
  return shift;
}

function getCurrentShift_(p) {
  var actor = actorContext_(p);
  var staffId = actor.id || str_(p && p.staffId, 64);
  return staffId ? currentOpenShiftForStaff_(staffId) : null;
}

function getShifts_(p) {
  p = p || {};
  var actor = actorContext_(p);
  var rows = listObjects_('Shifts');
  var staffId = str_(p.staffId, 64);
  var status = String(str_(p.status, 16)).toUpperCase();
  // Staff biasa hanya dapat melihat shift miliknya sendiri.
  if (actor.id && actor.role !== 'admin' && actor.role !== 'manager') staffId = actor.id;
  if (staffId) rows = rows.filter(function(s) { return String(s.staffId) === staffId; });
  if (status) rows = rows.filter(function(s) { return String(s.status).toUpperCase() === status; });
  rows.sort(function(a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
  var limit = Math.min(Math.max(Math.floor(Number(p.limit) || 100), 1), 500);
  return rows.slice(0, limit);
}

function openShift_(p) {
  p = p || {};
  var actor = actorContext_(p);
  var staffId = actor.id || str_(p.staffId, 64);
  if (!staffId) throw new Error('Staff wajib login untuk membuka shift');
  var staff = getObject_('Staff', staffId);
  if (!staff || !isActive_(staff)) throw new Error('Staff tidak aktif atau tidak ditemukan');
  if (currentOpenShiftForStaff_(staffId)) throw new Error('Staff masih memiliki shift yang terbuka');
  var openingCash = Math.max(0, Math.round(Number(p.openingCash) || 0));
  if (openingCash > 1000000000) throw new Error('Modal awal terlalu besar');
  var storeId = String(staff.storeId || actor.storeId || resolveStore_('').id || '');
  var shift = {
    id: 'SFT-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    storeId: storeId,
    staffId: String(staff.id),
    staffName: String(staff.name || actor.name || ''),
    role: roleKey_(staff.role),
    registerId: str_(p.registerId, 32) || 'REG-01',
    status: 'OPEN',
    openingCash: openingCash,
    openedAt: iso_(),
    closingCash: '', expectedCash: '', cashSales: '', cashRefunds: '', difference: '', closedAt: '',
    note: str_(p.note, 300)
  };
  appendObject_('Shifts', shift);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: storeId, userId: String(staff.id), action: 'SHIFT_OPEN', entity: 'SHIFT', entityId: shift.id,
    detail: JSON.stringify({registerId: shift.registerId, openingCash: openingCash}), createdAt: iso_()
  });
  return {ok: true, data: shift};
}

function shiftCashSummary_(shiftId) {
  var cashSales = 0, cashRefunds = 0, paidCount = 0, refundCount = 0;
  var orders = listObjects_('Orders');
  var orderById = indexBy_(orders, 'id');
  var payments = listObjects_('Payments').filter(function(pay){ return String(pay.shiftId || '') === String(shiftId) && String(pay.method || '').toUpperCase() === 'CASH'; });
  var paidOrderSeen = {}, refundedOrderSeen = {}, paymentOrderSeen = {};
  payments.forEach(function(pay){
    var order = orderById[String(pay.orderId)]; if (!order) return;
    var status = String(order.status || '').toUpperCase();
    paymentOrderSeen[String(order.id)] = true;
    if (status === 'PAID' || status === 'REFUNDED') {
      cashSales += Math.round(Number(pay.amount) || 0);
      if (!paidOrderSeen[String(order.id)]) { paidCount += 1; paidOrderSeen[String(order.id)] = true; }
    }
    if (status === 'REFUNDED') {
      cashRefunds += Math.round(Number(pay.amount) || 0);
      if (!refundedOrderSeen[String(order.id)]) { refundCount += 1; refundedOrderSeen[String(order.id)] = true; }
    }
  });
  // Kompatibilitas transaksi Stage 1-4 yang belum memiliki baris Payments.
  orders.forEach(function(o) {
    if (String(o.shiftId || '') !== String(shiftId) || paymentOrderSeen[String(o.id)]) return;
    if (String(o.paymentMethod || '').toUpperCase() !== 'CASH') return;
    var status = String(o.status || '').toUpperCase();
    if (status === 'PAID' || status === 'REFUNDED') { cashSales += Math.round(Number(o.total) || 0); paidCount += 1; }
    if (status === 'REFUNDED') { cashRefunds += Math.round(Number(o.refundedAmount) || Number(o.total) || 0); refundCount += 1; }
  });
  return {cashSales: cashSales, cashRefunds: cashRefunds, paidCount: paidCount, refundCount: refundCount};
}

function closeShift_(p) {
  p = p || {};
  var actor = actorContext_(p);
  var shift = null;
  var requestedShiftId = str_(p.shiftId, 64);
  if (requestedShiftId && (actor.role === 'admin' || actor.role === 'manager')) shift = getObject_('Shifts', requestedShiftId);
  if (!shift) {
    var staffId = actor.id || str_(p.staffId, 64);
    shift = currentOpenShiftForStaff_(staffId);
  }
  if (!shift) throw new Error('Tidak ada shift aktif');
  if (String(shift.status).toUpperCase() !== 'OPEN') throw new Error('Shift sudah ditutup');
  if (actor.id && actor.role !== 'admin' && actor.role !== 'manager' && String(shift.staffId) !== actor.id) throw new Error('Tidak boleh menutup shift staff lain');

  var closingCash = Math.max(0, Math.round(Number(p.closingCash) || 0));
  if (closingCash > 1000000000) throw new Error('Kas penutupan terlalu besar');
  var summary = shiftCashSummary_(shift.id);
  var expected = Math.round(Number(shift.openingCash) || 0) + summary.cashSales - summary.cashRefunds;
  shift.status = 'CLOSED';
  shift.closingCash = closingCash;
  shift.expectedCash = expected;
  shift.cashSales = summary.cashSales;
  shift.cashRefunds = summary.cashRefunds;
  shift.difference = closingCash - expected;
  shift.closedAt = iso_();
  shift.note = str_(p.note, 300) || String(shift.note || '');
  var row = findRow_('Shifts', shift.id);
  if (row) updateRow_('Shifts', row, shift);
  appendObject_('AuditLog', {
    id: uuid_(), storeId: shift.storeId, userId: actor.id || String(shift.staffId), action: 'SHIFT_CLOSE', entity: 'SHIFT', entityId: shift.id,
    detail: JSON.stringify({closingCash: closingCash, expectedCash: expected, difference: shift.difference, cashSales: summary.cashSales, cashRefunds: summary.cashRefunds}), createdAt: iso_()
  });
  return {ok: true, data: shift};
}

/* ---------------- Auth, lock, util ---------------- */

/**
 * Fail-closed: bila GAS_API_KEY belum diisi di Script Properties, semua request ditolak.
 * Versi sebelumnya melewatkan semua request ketika properti kosong (fail-open).
 */
function auth_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('GAS_API_KEY');
  if (!expected) throw new Error('Server belum dikonfigurasi: script property GAS_API_KEY kosong');
  var sent = String(key == null ? '' : key);
  if (sent.length !== String(expected).length) throw new Error('Unauthorized');
  var diff = 0;
  for (var i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ String(expected).charCodeAt(i);
  if (diff !== 0) throw new Error('Unauthorized');
}

/** Serialisasi tulis agar dua pesanan bersamaan tidak menimpa baris yang sama. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) throw new Error('Server sibuk, coba lagi sebentar');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function resolveStore_(storeIdOrSlug) {
  var key = str_(storeIdOrSlug, 64);
  var stores = listObjects_('Stores');
  var fallbackId = getSetting_('DEFAULT_STORE_ID');
  var match = null;
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    if (key && (String(s.id) === key || String(s.slug) === key)) { match = s; break; }
    if (!match && fallbackId && String(s.id) === String(fallbackId)) match = s;
  }
  if (match) return match;
  if (stores.length) return stores[0];
  return {id: key || 'store-001', name: key || 'Store', slug: '', phone: '', address: '', taxRate: 0, serviceRate: 0};
}

function resolveTableId_(storeId, tableCode, providedTableId) {
  if (providedTableId) return providedTableId;
  if (!tableCode) return '';
  var tables = listObjects_('Tables');
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    var sameStore = !storeId || String(t.storeId) === String(storeId);
    if (sameStore && String(t.code).toLowerCase() === String(tableCode).toLowerCase()) return t.id;
  }
  return '';
}

function isActive_(obj) {
  return obj && obj.active !== false && String(obj.active).toLowerCase() !== 'false';
}

function indexBy_(rows, key) {
  var out = {};
  for (var i = 0; i < rows.length; i++) out[String(rows[i][key])] = rows[i];
  return out;
}

function groupBy_(rows, key) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][key] || '');
    if (!k) continue;
    (out[k] = out[k] || []).push(rows[i]);
  }
  return out;
}

function requireId_(id) {
  var clean = str_(id, 64);
  if (!clean) throw new Error('Parameter id wajib diisi');
  return clean;
}

function str_(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}

function numberOr_(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function normalize_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function errorPayload_(err) {
  var message = String((err && err.message) || err || 'Unknown error');
  console.error('dispatch error: ' + message);
  return {ok: false, error: message};
}

function uuid_() { return Utilities.getUuid(); }
function iso_() { return new Date().toISOString(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Seed ---------------- */

function seedDemoData_() {
  if (sheet_('Stores').getLastRow() > 1) return;

  appendObject_('Stores', {
    id: 'store-001', name: 'Kastriva Grand Dining', slug: 'kastriva',
    phone: '', address: '', taxRate: 0, serviceRate: 5, createdAt: iso_(), loyaltyEnabled: true, loyaltySpendPerPoint: 10000, loyaltyPointValue: 100, maxRedeemPercent: 30
  });

  var tableCodes = ['meja-01','meja-02','meja-03','meja-04','meja-05','meja-06','meja-07','meja-08','meja-09','meja-10'];
  var seats = [2,2,4,4,6];
  appendRows_('Tables', tableCodes.map(function(code, i) {
    return {
      id: 'table-' + (i + 1), storeId: 'store-001', code: code,
      seats: seats[i % seats.length], status: 'AVAILABLE', createdAt: iso_()
    };
  }));

  var cats = ['Starter','Main Course','Beverage','Dessert'];
  appendRows_('Categories', cats.map(function(name, i) {
    return {id: 'cat-' + i, storeId: 'store-001', name: name, sortOrder: i, active: true};
  }));
  var catId = {'Starter': 'cat-0', 'Main Course': 'cat-1', 'Beverage': 'cat-2', 'Dessert': 'cat-3'};

  var menuRows = [
    ['m1','Main Course','Beef Tenderloin',185000,85000,18,'\uD83E\uDD69'],
    ['m2','Main Course','Truffle Pasta',125000,55000,24,'\uD83C\uDF5D'],
    ['m3','Main Course','Salmon Miso',165000,70000,12,'\uD83C\uDF63'],
    ['m4','Starter','Garden Salad',65000,25000,30,'\uD83E\uDD57'],
    ['m5','Starter','Mushroom Soup',55000,18000,25,'\uD83C\uDF72'],
    ['m6','Beverage','Signature Mocktail',48000,12000,40,'\uD83C\uDF79'],
    ['m7','Beverage','Espresso Martini',85000,25000,16,'\uD83C\uDF78'],
    ['m8','Dessert','Tiramisu',58000,20000,20,'\uD83C\uDF70'],
    ['m9','Dessert','Cheesecake',52000,18000,14,'\uD83C\uDF6E']
  ];
  appendRows_('Menu', menuRows.map(function(m) {
    return {
      id: m[0], storeId: 'store-001', categoryId: catId[m[1]], name: m[2], description: '',
      price: m[3], cost: m[4], stock: m[5], active: true, emoji: m[6], imageUrl: '',
      createdAt: iso_(), updatedAt: iso_()
    };
  }));

  appendObject_('Settings', {key: 'DEFAULT_STORE_ID', value: 'store-001', updatedAt: iso_()});
}

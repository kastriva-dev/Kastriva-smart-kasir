import type {GasOrder} from "./api.ts";

export type PrinterSlot = "receipt" | "kitchen";
export type PrinterTransport = "browser" | "serial" | "bluetooth";

export type PrinterProfile = {
  enabled: boolean;
  transport: PrinterTransport;
  paperWidth: 58 | 80;
  baudRate: number;
  serviceUuid: string;
  characteristicUuid: string;
  cutPaper: boolean;
};

export type HardwareSettings = {
  receipt: PrinterProfile;
  kitchen: PrinterProfile;
  kitchenUseReceiptPrinter: boolean;
  autoPrintReceipt: boolean;
  autoPrintKitchen: boolean;
  openDrawerOnCash: boolean;
  keyboardScanner: boolean;
  cameraScanner: boolean;
};

const STORAGE_KEY = "kastriva:hardware:v1";
const KITCHEN_PRINTED_KEY = "kastriva:kitchenPrinted:v1";

const defaultPrinter = (): PrinterProfile => ({
  enabled: false,
  transport: "browser",
  paperWidth: 58,
  baudRate: 9600,
  serviceUuid: "0000ff00-0000-1000-8000-00805f9b34fb",
  characteristicUuid: "0000ff02-0000-1000-8000-00805f9b34fb",
  cutPaper: true
});

export const DEFAULT_HARDWARE_SETTINGS: HardwareSettings = {
  receipt: defaultPrinter(),
  kitchen: defaultPrinter(),
  kitchenUseReceiptPrinter: true,
  autoPrintReceipt: false,
  autoPrintKitchen: false,
  openDrawerOnCash: false,
  keyboardScanner: true,
  cameraScanner: true
};

export function loadHardwareSettings(): HardwareSettings {
  if (typeof window === "undefined") return DEFAULT_HARDWARE_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Partial<HardwareSettings>;
    return {
      ...DEFAULT_HARDWARE_SETTINGS,
      ...parsed,
      receipt: {...DEFAULT_HARDWARE_SETTINGS.receipt, ...(parsed.receipt || {})},
      kitchen: {...DEFAULT_HARDWARE_SETTINGS.kitchen, ...(parsed.kitchen || {})}
    };
  } catch {
    return DEFAULT_HARDWARE_SETTINGS;
  }
}

export function saveHardwareSettings(settings: HardwareSettings) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function normalizeScannedBarcode(value: string): string {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase().slice(0, 64);
}

function money(value: number) {
  return `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

function textWidth(paper: 58 | 80) {
  return paper === 80 ? 48 : 32;
}

function plain(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function crop(value: string, width: number) {
  return plain(value).slice(0, Math.max(1, width));
}

function twoCol(left: string, right: string, width: number) {
  const r = crop(right, Math.min(width - 1, right.length || 1));
  const maxLeft = Math.max(1, width - r.length - 1);
  const l = crop(left, maxLeft);
  return l + " ".repeat(Math.max(1, width - l.length - r.length)) + r;
}

function divider(width: number) {
  return "-".repeat(width);
}

export function buildReceiptText(order: GasOrder, storeName: string, paper: 58 | 80 = 58): string {
  const width = textWidth(paper);
  const lines: string[] = [];
  lines.push(crop(storeName || "KASTRIVA POS", width));
  lines.push(`Struk: ${crop(order.id, width - 7)}`);
  lines.push(crop(new Date(order.createdAt).toLocaleString("id-ID"), width));
  lines.push(crop(order.tableCode ? `Meja ${order.tableCode}` : "Takeaway", width));
  if (order.staffName) lines.push(crop(`Kasir: ${order.staffName}`, width));
  if (order.registerId) lines.push(crop(`Register: ${order.registerId}`, width));
  lines.push(divider(width));
  for (const item of order.items || []) {
    lines.push(crop(`${item.name} x${item.qty}`, width));
    lines.push(twoCol(`${money(item.price)} x ${item.qty}`, money(item.price * item.qty), width));
  }
  lines.push(divider(width));
  lines.push(twoCol("Subtotal", money(order.subtotal), width));
  if (Number(order.discount) > 0) lines.push(twoCol("Diskon", `-${money(Number(order.discount))}`, width));
  if (Number(order.tax) > 0) lines.push(twoCol("Pajak", money(order.tax), width));
  if (Number(order.service) > 0) lines.push(twoCol("Service", money(order.service), width));
  lines.push(twoCol("TOTAL", money(order.total), width));
  let paymentRows = order.payments || [];
  if (!paymentRows.length && order.paymentSummary) { try { paymentRows = JSON.parse(order.paymentSummary); } catch { paymentRows = []; } }
  if (paymentRows.length > 1) paymentRows.forEach(pay => lines.push(twoCol(pay.method || "BAYAR", money(Number(pay.amount) || 0), width)));
  else lines.push(twoCol(order.paymentMethod || "BAYAR", money(Number(order.total) || 0), width));
  if (order.memberCode) lines.push(crop(`Member ${order.memberCode} | +${Number(order.pointsEarned)||0} poin`, width));
  if (Number(order.changeAmount) > 0) lines.push(twoCol("Kembalian", money(Number(order.changeAmount)), width));
  lines.push(divider(width));
  lines.push("Terima kasih");
  return lines.join("\n") + "\n\n";
}

export function buildKitchenText(order: GasOrder, paper: 58 | 80 = 58): string {
  const width = textWidth(paper);
  const lines: string[] = [];
  lines.push(crop(`KITCHEN ${order.id}`, width));
  lines.push(crop(`${order.tableCode || "TAKEAWAY"} | ${order.channel || "POS"}`, width));
  if (order.customerName) lines.push(crop(`Pelanggan: ${order.customerName}`, width));
  lines.push(crop(new Date(order.createdAt).toLocaleTimeString("id-ID", {hour: "2-digit", minute: "2-digit"}), width));
  lines.push(divider(width));
  for (const item of order.items || []) {
    lines.push(crop(`${item.qty}x ${item.name}`, width));
    if (item.note) lines.push(crop(`  NOTE: ${item.note}`, width));
  }
  if (order.note) {
    lines.push(divider(width));
    lines.push(crop(`CATATAN: ${order.note}`, width));
  }
  lines.push(divider(width));
  lines.push("DAPUR / BAR");
  return lines.join("\n") + "\n\n";
}

type SerialWriter = {write(data: Uint8Array): Promise<void>; releaseLock(): void};
type SerialPortLike = {
  readable?: unknown;
  writable?: {getWriter(): SerialWriter} | null;
  open(options: {baudRate: number}): Promise<void>;
  close(): Promise<void>;
};
type SerialApi = {requestPort(): Promise<SerialPortLike>; getPorts?(): Promise<SerialPortLike[]>};
type BluetoothCharacteristicLike = {writeValue(data: BufferSource): Promise<void>; writeValueWithoutResponse?(data: BufferSource): Promise<void>};
type BluetoothDeviceLike = {
  name?: string;
  gatt?: {connect(): Promise<{getPrimaryService(uuid: string): Promise<{getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>}>}>};
};
type BluetoothApi = {requestDevice(options: {acceptAllDevices: boolean; optionalServices: string[]}): Promise<BluetoothDeviceLike>};

const serialPorts: Partial<Record<PrinterSlot, SerialPortLike>> = {};
const bleCharacteristics: Partial<Record<PrinterSlot, BluetoothCharacteristicLike>> = {};

function serialApi(): SerialApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & {serial?: SerialApi}).serial || null;
}

function bluetoothApi(): BluetoothApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & {bluetooth?: BluetoothApi}).bluetooth || null;
}

export function hardwareSupport() {
  return {
    serial: !!serialApi(),
    bluetooth: !!bluetoothApi(),
    cameraBarcode: typeof window !== "undefined" && "BarcodeDetector" in window
  };
}

function effectiveSlot(slot: PrinterSlot, settings: HardwareSettings) {
  return slot === "kitchen" && settings.kitchenUseReceiptPrinter ? "receipt" : slot;
}

function profileFor(slot: PrinterSlot, settings: HardwareSettings) {
  const real = effectiveSlot(slot, settings);
  return {slot: real, profile: settings[real]};
}

export async function connectPrinter(slot: PrinterSlot, settings = loadHardwareSettings()): Promise<string> {
  const {slot: realSlot, profile} = profileFor(slot, settings);
  if (profile.transport === "browser") return "Mode browser tidak memerlukan koneksi langsung";
  if (profile.transport === "serial") {
    const api = serialApi();
    if (!api) throw new Error("Web Serial tidak didukung browser ini. Gunakan Chrome/Edge desktop atau mode Browser Print.");
    const port = await api.requestPort();
    if (!port.writable) await port.open({baudRate: Math.max(1200, Number(profile.baudRate) || 9600)});
    serialPorts[realSlot] = port;
    return "Printer serial terhubung untuk sesi ini";
  }
  const api = bluetoothApi();
  if (!api) throw new Error("Web Bluetooth tidak didukung browser ini");
  if (!profile.serviceUuid || !profile.characteristicUuid) throw new Error("UUID service dan characteristic BLE wajib diisi");
  const device = await api.requestDevice({acceptAllDevices: true, optionalServices: [profile.serviceUuid]});
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Gagal membuka koneksi BLE printer");
  const service = await server.getPrimaryService(profile.serviceUuid);
  bleCharacteristics[realSlot] = await service.getCharacteristic(profile.characteristicUuid);
  return `Printer BLE ${device.name || ""} terhubung untuk sesi ini`.trim();
}

export async function disconnectPrinter(slot: PrinterSlot, settings = loadHardwareSettings()) {
  const {slot: realSlot} = profileFor(slot, settings);
  const port = serialPorts[realSlot];
  if (port) {
    try { await port.close(); } catch { /* ignore disconnect race */ }
    delete serialPorts[realSlot];
  }
  delete bleCharacteristics[realSlot];
}

export function printerConnected(slot: PrinterSlot, settings = loadHardwareSettings()) {
  const {slot: realSlot, profile} = profileFor(slot, settings);
  if (profile.transport === "browser") return true;
  if (profile.transport === "serial") return !!serialPorts[realSlot]?.writable;
  return !!bleCharacteristics[realSlot];
}

function escPosPayload(text: string, cutPaper: boolean) {
  const encoder = new TextEncoder();
  const init = new Uint8Array([0x1b, 0x40]);
  const body = encoder.encode(text);
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a]);
  const cut = cutPaper ? new Uint8Array([0x1d, 0x56, 0x00]) : new Uint8Array();
  const out = new Uint8Array(init.length + body.length + feed.length + cut.length);
  out.set(init, 0); out.set(body, init.length); out.set(feed, init.length + body.length); out.set(cut, init.length + body.length + feed.length);
  return out;
}

async function writeDirect(slot: PrinterSlot, bytes: Uint8Array, settings: HardwareSettings) {
  const {slot: realSlot, profile} = profileFor(slot, settings);
  if (profile.transport === "browser") return false;
  if (profile.transport === "serial") {
    const port = serialPorts[realSlot];
    if (!port?.writable) throw new Error(`Printer ${realSlot} belum terhubung. Buka menu Perangkat lalu klik Hubungkan.`);
    const writer = port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
    return true;
  }
  const characteristic = bleCharacteristics[realSlot];
  if (!characteristic) throw new Error(`Printer BLE ${realSlot} belum terhubung. Buka menu Perangkat lalu klik Hubungkan.`);
  // Banyak BLE printer membatasi packet ~20-180 byte. 120 aman untuk mayoritas perangkat.
  for (let i = 0; i < bytes.length; i += 120) {
    const chunk = bytes.slice(i, i + 120);
    if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
  }
  return true;
}

export async function printReceiptDirect(order: GasOrder, storeName: string, settings = loadHardwareSettings()) {
  const {profile} = profileFor("receipt", settings);
  if (!profile.enabled || profile.transport === "browser") return false;
  return writeDirect("receipt", escPosPayload(buildReceiptText(order, storeName, profile.paperWidth), profile.cutPaper), settings);
}

export function wasKitchenPrinted(orderId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ids = JSON.parse(window.localStorage.getItem(KITCHEN_PRINTED_KEY) || "[]") as unknown;
    return Array.isArray(ids) && ids.includes(String(orderId));
  } catch { return false; }
}

export function markKitchenPrinted(orderId: string) {
  if (typeof window === "undefined") return;
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KITCHEN_PRINTED_KEY) || "[]") as unknown;
    if (Array.isArray(parsed)) ids = parsed.map(String);
  } catch { /* reset invalid cache */ }
  const id = String(orderId);
  ids = [id, ...ids.filter(x => x !== id)].slice(0, 500);
  window.localStorage.setItem(KITCHEN_PRINTED_KEY, JSON.stringify(ids));
}

export async function printKitchenOnce(order: GasOrder, settings = loadHardwareSettings()) {
  if (wasKitchenPrinted(order.id)) return false;
  const sent = await printKitchenDirect(order, settings);
  if (sent) markKitchenPrinted(order.id);
  return sent;
}

export async function printKitchenDirect(order: GasOrder, settings = loadHardwareSettings()) {
  const {profile} = profileFor("kitchen", settings);
  if (!profile.enabled || profile.transport === "browser") return false;
  return writeDirect("kitchen", escPosPayload(buildKitchenText(order, profile.paperWidth), profile.cutPaper), settings);
}

export async function printTestPage(slot: PrinterSlot, settings = loadHardwareSettings()) {
  const {profile} = profileFor(slot, settings);
  if (profile.transport === "browser") throw new Error("Test direct tidak tersedia pada Browser Print");
  const label = slot === "receipt" ? "RECEIPT PRINTER" : "KITCHEN PRINTER";
  return writeDirect(slot, escPosPayload(`KASTRIVA POS PRO\n${label}\nTEST OK\n\n`, profile.cutPaper), settings);
}

export async function openCashDrawer(settings = loadHardwareSettings()) {
  const {profile} = profileFor("receipt", settings);
  if (!profile.enabled || profile.transport === "browser") return false;
  // ESC p m t1 t2: pulse pin cash drawer melalui port printer thermal.
  return writeDirect("receipt", new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]), settings);
}

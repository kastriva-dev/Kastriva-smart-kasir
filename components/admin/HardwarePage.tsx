"use client";
import {useMemo, useState} from "react";
import {Bluetooth, Cable, Printer, Save, ScanBarcode, Unplug, WalletCards} from "lucide-react";
import {
  connectPrinter,
  disconnectPrinter,
  hardwareSupport,
  loadHardwareSettings,
  openCashDrawer,
  printTestPage,
  saveHardwareSettings,
  type HardwareSettings,
  type PrinterProfile,
  type PrinterSlot
} from "@/lib/hardware";
import {Field} from "@/components/admin/ui";

function PrinterSetup({slot, label, profile, settings, onChange, status, setStatus}: {
  slot: PrinterSlot;
  label: string;
  profile: PrinterProfile;
  settings: HardwareSettings;
  onChange: (value: PrinterProfile) => void;
  status: string;
  setStatus: (value: string) => void;
}) {
  const mutate = <K extends keyof PrinterProfile>(key: K, value: PrinterProfile[K]) => onChange({...profile, [key]: value});
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setStatus(ok); } catch (e) { setStatus(e instanceof Error ? e.message : "Operasi perangkat gagal"); }
  };
  return (
    <div className="card subCard hardwareCard">
      <div className="split"><h3>{label}</h3><span className={`badge ${profile.enabled ? "green" : ""}`}>{profile.enabled ? "AKTIF" : "OFF"}</span></div>
      <label className="split rowLine"><span>Aktifkan printer</span><input type="checkbox" checked={profile.enabled} onChange={e => mutate("enabled", e.target.checked)} /></label>
      <div className="formGrid">
        <Field label="Transport">
          <select className="input" value={profile.transport} onChange={e => mutate("transport", e.target.value as PrinterProfile["transport"])}>
            <option value="browser">Browser Print</option>
            <option value="serial">USB / Serial ESC/POS</option>
            <option value="bluetooth">Bluetooth Low Energy</option>
          </select>
        </Field>
        <Field label="Lebar kertas">
          <select className="input" value={profile.paperWidth} onChange={e => mutate("paperWidth", Number(e.target.value) as 58 | 80)}>
            <option value={58}>58 mm (32 karakter)</option><option value={80}>80 mm (48 karakter)</option>
          </select>
        </Field>
        {profile.transport === "serial" ? <Field label="Baud rate"><select className="input" value={profile.baudRate} onChange={e => mutate("baudRate", Number(e.target.value))}>{[9600,19200,38400,57600,115200].map(v => <option key={v}>{v}</option>)}</select></Field> : null}
        {profile.transport === "bluetooth" ? <>
          <Field label="BLE Service UUID"><input className="input" value={profile.serviceUuid} onChange={e => mutate("serviceUuid", e.target.value.trim())} /></Field>
          <Field label="BLE Characteristic UUID"><input className="input" value={profile.characteristicUuid} onChange={e => mutate("characteristicUuid", e.target.value.trim())} /></Field>
        </> : null}
      </div>
      <label className="split rowLine"><span>Potong kertas otomatis (ESC/POS cut)</span><input type="checkbox" checked={profile.cutPaper} onChange={e => mutate("cutPaper", e.target.checked)} /></label>
      <div className="btnRow" style={{marginTop: 10}}>
        {profile.transport !== "browser" ? <button type="button" className="btn primary" onClick={() => act(() => connectPrinter(slot, settings), "Printer terhubung untuk sesi browser ini")}><Cable size={15} /> Hubungkan</button> : null}
        {profile.transport !== "browser" ? <button type="button" className="btn" onClick={() => act(() => printTestPage(slot, settings), "Test print dikirim")}><Printer size={15} /> Test</button> : null}
        {profile.transport !== "browser" ? <button type="button" className="btn danger" onClick={() => act(() => disconnectPrinter(slot, settings), "Printer dilepas")}><Unplug size={15} /> Lepas</button> : null}
      </div>
      {status ? <p className="muted hardwareStatus">{status}</p> : null}
    </div>
  );
}

export default function HardwarePage({notify}: {notify: (message: string) => void}) {
  const [settings, setSettings] = useState<HardwareSettings>(() => loadHardwareSettings());
  const [receiptStatus, setReceiptStatus] = useState("");
  const [kitchenStatus, setKitchenStatus] = useState("");
  const support = useMemo(() => hardwareSupport(), []);
  const save = () => { saveHardwareSettings(settings); notify("Konfigurasi perangkat disimpan di perangkat ini"); };
  const drawerTest = async () => {
    try { const sent = await openCashDrawer(settings); notify(sent ? "Pulse cash drawer dikirim" : "Cash drawer butuh printer ESC/POS direct"); }
    catch (e) { notify(e instanceof Error ? e.message : "Test cash drawer gagal"); }
  };
  return (
    <div className="grid" style={{gap: 14}}>
      <div className="card glass">
        <div className="split"><div><h2>Hardware POS</h2><p className="muted">Konfigurasi ini tersimpan lokal per PC/HP, sehingga tiap kasir dapat memakai printer dan scanner berbeda.</p></div><button type="button" className="btn primary" onClick={save}><Save size={15} /> Simpan</button></div>
        <div className="hardwareSupport" style={{marginTop: 12}}>
          <span className={`badge ${support.serial ? "green" : "red"}`}><Cable size={13} /> Web Serial {support.serial ? "OK" : "Tidak tersedia"}</span>
          <span className={`badge ${support.bluetooth ? "green" : "red"}`}><Bluetooth size={13} /> Web Bluetooth {support.bluetooth ? "OK" : "Tidak tersedia"}</span>
          <span className={`badge ${support.cameraBarcode ? "green" : "amber"}`}><ScanBarcode size={13} /> Camera Barcode {support.cameraBarcode ? "OK" : "Fallback USB"}</span>
        </div>
      </div>

      <div className="grid layout2">
        <PrinterSetup slot="receipt" label="Receipt Printer" profile={settings.receipt} settings={settings} onChange={receipt => setSettings({...settings, receipt})} status={receiptStatus} setStatus={setReceiptStatus} />
        <PrinterSetup slot="kitchen" label="Kitchen Printer" profile={settings.kitchen} settings={settings} onChange={kitchen => setSettings({...settings, kitchen})} status={kitchenStatus} setStatus={setKitchenStatus} />
      </div>

      <div className="card glass">
        <h2>Otomasi & Scanner</h2>
        <label className="split rowLine"><span>Kitchen memakai printer struk yang sama</span><input type="checkbox" checked={settings.kitchenUseReceiptPrinter} onChange={e => setSettings({...settings, kitchenUseReceiptPrinter: e.target.checked})} /></label>
        <label className="split rowLine"><span>Cetak struk otomatis setelah pembayaran <small className="muted">(direct printer)</small></span><input type="checkbox" disabled={settings.receipt.transport === "browser"} checked={settings.autoPrintReceipt && settings.receipt.transport !== "browser"} onChange={e => setSettings({...settings, autoPrintReceipt: e.target.checked})} /></label>
        <label className="split rowLine"><span>Cetak tiket dapur otomatis <small className="muted">(direct printer)</small></span><input type="checkbox" disabled={(settings.kitchenUseReceiptPrinter ? settings.receipt : settings.kitchen).transport === "browser"} checked={settings.autoPrintKitchen && (settings.kitchenUseReceiptPrinter ? settings.receipt : settings.kitchen).transport !== "browser"} onChange={e => setSettings({...settings, autoPrintKitchen: e.target.checked})} /></label>
        <label className="split rowLine"><span>Buka cash drawer otomatis untuk pembayaran tunai</span><input type="checkbox" checked={settings.openDrawerOnCash} onChange={e => setSettings({...settings, openDrawerOnCash: e.target.checked})} /></label>
        <label className="split rowLine"><span>Scanner USB / Bluetooth keyboard-wedge</span><input type="checkbox" checked={settings.keyboardScanner} onChange={e => setSettings({...settings, keyboardScanner: e.target.checked})} /></label>
        <label className="split rowLine"><span>Scanner kamera HP</span><input type="checkbox" checked={settings.cameraScanner} onChange={e => setSettings({...settings, cameraScanner: e.target.checked})} /></label>
        <div className="btnRow" style={{marginTop: 12}}><button type="button" className="btn" onClick={drawerTest}><WalletCards size={15} /> Test Cash Drawer</button></div>
        <p className="muted" style={{marginTop: 12}}>Catatan: mayoritas scanner USB bekerja sebagai keyboard tanpa driver tambahan. Bluetooth Classic/SPP tidak dapat diakses langsung oleh semua browser; gunakan Web Serial bila printer muncul sebagai COM/serial, BLE bila printer menyediakan service GATT, atau Browser Print sebagai fallback.</p>
      </div>
    </div>
  );
}

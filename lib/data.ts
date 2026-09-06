export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "Kastriva Smart Kasir";
export const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID || "kastriva";
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "IDR";

function createFormatter(currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", {style: "currency", currency, maximumFractionDigits: 0});
  } catch {
    // Kode mata uang salah di env tidak boleh membuat seluruh aplikasi gagal render.
    return new Intl.NumberFormat("id-ID", {style: "currency", currency: "IDR", maximumFractionDigits: 0});
  }
}

const currencyFormatter = createFormatter(CURRENCY);

export const rupiah = (n: number) => currencyFormatter.format(Number.isFinite(n) ? n : 0);

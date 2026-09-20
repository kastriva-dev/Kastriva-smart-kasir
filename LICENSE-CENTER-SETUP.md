# Setup Kastriva License Center

## 1. Generate password hash + session secret (sekali saja)

Di folder project jalankan:

```powershell
npm run license-center:setup -- "PASSWORD-KHUSUS-LICENSE-CENTER"
```

Gunakan password yang berbeda dari password Admin POS pelanggan.

## 2. Tambahkan Environment Variables di Vercel

Tambahkan hasil command di atas:

```text
LICENSE_CENTER_PASSWORD_HASH=...
LICENSE_CENTER_AUTH_SECRET=...
```

Pastikan nilai berikut yang sudah digunakan oleh KSP1 tetap tersedia:

```text
LICENSE_SIGNING_SECRET=...
```

Opsional:

```text
LICENSE_CENTER_SESSION_HOURS=12
```

Jangan memakai prefix `NEXT_PUBLIC_` untuk semua nilai rahasia di atas.

## 3. Redeploy

Setelah env tersimpan, redeploy project di Vercel.

## 4. Gunakan dari mana saja

Buka:

```text
https://DOMAIN-ANDA/license-center
```

Login menggunakan password License Center, lalu isi:

- Customer / nama usaha
- Installation ID pelanggan
- Paket STARTER / PRO / BUSINESS
- Masa aktif
- Batas outlet
- License ID opsional

Klik **Generate KSP1**, lalu salin kode ke aplikasi pelanggan:

**Owner & SaaS → Subscription → Kode lisensi KSP1 → Aktifkan Lisensi**

## Keamanan

License Center tidak muncul di sidebar POS dan tidak menerima session Admin POS pelanggan. Generator hanya menerima session khusus `kastriva_license_center` yang dibuat setelah password License Center diverifikasi di server. `LICENSE_SIGNING_SECRET` tidak pernah dikirim ke browser.

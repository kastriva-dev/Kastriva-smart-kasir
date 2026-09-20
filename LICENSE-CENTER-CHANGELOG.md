# Kastriva POS Pro v2.5.2 — Web License Center

- Menambahkan halaman `/license-center` yang dapat digunakan dari HP, tablet, atau laptop.
- Login License Center dipisahkan dari login Admin POS pelanggan.
- Cookie session khusus HttpOnly, SameSite=Strict, dan Secure pada HTTPS.
- Password disimpan sebagai hash scrypt melalui `LICENSE_CENTER_PASSWORD_HASH`.
- Signing KSP1 tetap dilakukan server-side memakai `LICENSE_SIGNING_SECRET`.
- Generator mendukung STARTER / PRO / BUSINESS, 1–3650 hari, 1–100 outlet, Installation ID, dan License ID opsional.
- Kode dapat disalin langsung dari browser.
- Rate limit login dan pembuatan lisensi.
- Tidak menambah atau mengubah schema Google Sheets / GAS.
- Menambahkan `npm run license-center:setup` untuk setup awal password dan secret session.
- Menambahkan test session License Center; total automated test menjadi 107/107 PASS.

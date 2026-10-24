# XMOC Bogor Raya — Direktori Member

Web app direktori member **XMOC Bogor Raya** (Xpander Mitsubishi Owners Club). Statis, tanpa build step, dan di-host di GitHub Pages.

## Fitur

- Pencarian instan berdasarkan nama, nomor member (X-ID), atau plat nomor (spasi tidak berpengaruh: `f1689rj` = `F 1689 RJ`)
- Filter per wilayah plat, Chapter Gabungan, dan member tanpa plat
- Tampilan kartu atau tabel, urut berdasarkan nomor / nama / plat
- Detail member dengan tombol salin dan bagikan (WhatsApp / share sheet)
- Statistik sebaran wilayah plat dan nomor member
- Ekspor CSV, mode gelap/terang, bisa di-install sebagai aplikasi (PWA)
- Link bisa dibagikan: `?q=andri`, `?f=area:B`, `?m=X-1085`

## Update data member

1. Edit [`data/members.txt`](data/members.txt) — satu member per baris: `X-XXXX PLAT Nama (catatan opsional)`.
2. Jalankan `node scripts/build-data.mjs` untuk membuat ulang `data/members.js`.
3. Commit dan push — GitHub Pages akan memperbarui situs otomatis.

## Jalankan lokal

```sh
python3 -m http.server 8000
# buka http://localhost:8000
```

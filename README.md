# XMOC Bogor Raya — Direktori Member

Web app direktori member **XMOC Bogor Raya** (Xpander Mitsubishi Owners Club). Statis, tanpa build step, dan di-host di GitHub Pages. Login, profil member, dan panel admin memakai [Supabase](https://supabase.com) (paket gratis cukup).

## Fitur

**Direktori (publik)**
- Pencarian instan berdasarkan nama, nomor member (X-ID), plat nomor (spasi tidak berpengaruh: `f1689rj` = `F 1689 RJ`), atau domisili
- Filter per wilayah plat, Chapter Gabungan, dan member tanpa plat
- Tampilan kartu atau tabel, detail member, salin dan bagikan, statistik, ekspor CSV, mode gelap, PWA
- Link bisa dibagikan: `?q=andri`, `?f=area:B`, `?m=X-1085`

**Member (perlu login)**
- Masuk dengan email (link atau kode 6 digit, tanpa password), opsional Google
- Mengajukan klaim "ini saya" atas data X-ID; admin memverifikasi
- Setelah terverifikasi: ubah foto, plat, domisili, tipe/warna/tahun Xpander, bio, WhatsApp, dan Instagram
- Kontak (WA/IG) hanya terlihat oleh sesama member terverifikasi

**Admin**
- Tambah, ubah, dan hapus member
- Setujui atau tolak klaim, serta hubungkan/lepas akun secara manual
- Impor langsung dari pesan WhatsApp *UPDATE DATA MEMBER*, dengan pratinjau data baru, berubah, dan hilang
- Log aktivitas: siapa mengubah apa, sebelum dan sesudah

**Superadmin**: semua fitur admin, plus mengangkat atau mencabut admin, termasuk mengundang lewat email sebelum orangnya mendaftar.

Semua aturan akses ditegakkan di database (Row Level Security di [`supabase/schema.sql`](supabase/schema.sql)), bukan hanya di tampilan.

| Peran | Lihat direktori | Ubah profil sendiri | Lihat kontak | Kelola member & klaim | Atur peran |
|---|:-:|:-:|:-:|:-:|:-:|
| Publik | ✓ | | | | |
| Login, belum terverifikasi | ✓ | | | | |
| Member terverifikasi | ✓ | ✓ | ✓ | | |
| Admin | ✓ | ✓ | ✓ | ✓ | |
| Superadmin | ✓ | ✓ | ✓ | ✓ | ✓ |

## Setup Supabase (sekali saja)

Selama [`assets/config.js`](assets/config.js) masih kosong, situs berjalan dalam mode statis (data dari `data/members.js`, tanpa login).

1. **Buat proyek** di [supabase.com](https://supabase.com) → New project. Pilih region *Southeast Asia (Singapore)*.
2. **Pasang database.** Buka *SQL Editor*, tempel isi [`supabase/schema.sql`](supabase/schema.sql), lalu Run. Ulangi dengan [`supabase/seed.sql`](supabase/seed.sql) untuk mengisi data member.
3. **Tetapkan superadmin pertama.** Di SQL Editor, jalankan dengan email Anda:
   ```sql
   insert into public.role_invites (email, role) values ('EMAIL_ANDA', 'superadmin')
   on conflict (email) do update set role = 'superadmin';
   update public.accounts set role = 'superadmin' where lower(email) = lower('EMAIL_ANDA');
   ```
4. **Atur URL login.** Buka *Authentication → URL Configuration*:
   - Site URL: `https://ahyo.github.io/x-moc/`
   - Redirect URLs: `https://ahyo.github.io/x-moc/**` (tambahkan `http://localhost:8000/**` untuk uji lokal)
5. **Tampilkan kode di email login.** Buka *Authentication → Email Templates → Magic Link*, lalu tambahkan `{{ .Token }}` ke isi email, misalnya `Kode masuk Anda: {{ .Token }}`. Kode ini berguna saat link dibuka di browser yang berbeda, misalnya dari dalam WhatsApp.
6. **Pasang SMTP sendiri.** Ini penting: pengirim email bawaan Supabase sangat terbatas dan tidak cocok untuk ratusan member. Buka *Authentication → SMTP Settings* lalu isi dengan layanan gratis seperti Brevo atau Resend. Alternatifnya, aktifkan login Google (lihat langkah 8).
7. **Hubungkan situs.** Buka *Project Settings → API Keys*, salin Project URL dan publishable/anon key ke [`assets/config.js`](assets/config.js), lalu commit dan push. Key ini memang aman untuk publik; yang rahasia adalah *service_role/secret key*, dan key itu **jangan pernah** dimasukkan ke repo.
8. *(Opsional)* **Login Google.** Aktifkan di *Authentication → Providers → Google* (perlu OAuth Client dari Google Cloud Console), lalu set `googleLogin: true` di `assets/config.js`.

Setelah itu, superadmin login di situs, membuka **Panel admin** dari menu akun, lalu bisa mengangkat admin lain di tab *Pengguna*.

## Update data member

Setelah Supabase aktif, **database menjadi sumber data utama**. Update dilakukan dari *Panel admin → Impor WA*: tempel pesan WhatsApp, cek pratinjau, lalu klik Terapkan.

`data/members.js` tetap dipakai sebagai cadangan, yaitu ditampilkan sesaat sebelum data live termuat, atau saat Supabase tidak bisa diakses. Untuk memperbaruinya:

```sh
node scripts/import-wa.mjs update.txt   # pesan WhatsApp → data/members.txt
node scripts/build-data.mjs             # → data/members.js dan supabase/seed.sql
```

## Struktur

| File | Isi |
|---|---|
| `index.html`, `assets/app.js` | Direktori |
| `profile.html`, `assets/profile.js` | Profil member dan klaim X-ID |
| `admin.html`, `assets/admin.js` | Panel admin |
| `assets/core.js` | Koneksi Supabase, login, menu akun, util bersama |
| `assets/member-form.js` | Formulir member (dipakai profil dan admin) |
| `assets/parse.js` | Parser daftar member/WhatsApp (dipakai browser dan script) |
| `supabase/schema.sql` | Tabel, fungsi, trigger, dan aturan akses (RLS) |

## Jalankan lokal

```sh
python3 -m http.server 8000
# buka http://localhost:8000
```

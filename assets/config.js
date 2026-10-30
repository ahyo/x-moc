// Koneksi ke Supabase. Isi dari Supabase → Project Settings → API.
// Anon key memang aman untuk dipublikasikan: semua akses dibatasi oleh aturan RLS di supabase/schema.sql.
// Selama masih kosong, situs berjalan dalam mode statis (data dari data/members.js, tanpa login).
window.XMOC_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Aktifkan setelah provider Google disetel di Supabase → Authentication → Providers.
  googleLogin: false,
};

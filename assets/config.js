// Koneksi ke Supabase. Isi dari Supabase → Project Settings → API.
// Anon key memang aman untuk dipublikasikan: semua akses dibatasi oleh aturan RLS di supabase/schema.sql.
// Selama masih kosong, situs berjalan dalam mode statis (data dari data/members.js, tanpa login).
window.XMOC_CONFIG = {
  supabaseUrl: "https://ongytlryrxnftknqqgyd.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZ3l0bHJ5cnhuZnRrbnFxZ3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNDA5OTYsImV4cCI6MjEwODkxNjk5Nn0.3zVRiaIQj9Rb9jK4I5UMoETijW7cUBmvO29yirg9qn8",
  // Aktifkan setelah provider Google disetel di Supabase → Authentication → Providers.
  googleLogin: true,
};

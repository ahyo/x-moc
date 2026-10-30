// Modul bersama untuk semua halaman: koneksi Supabase, login, menu pengguna, tema, dan util tampilan.
(() => {
  "use strict";

  const cfg = window.XMOC_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  // Kode wilayah plat nomor Indonesia (yang dipakai member).
  const AREAS = {
    F: "Bogor · Sukabumi · Cianjur",
    B: "Jakarta · Depok · Tangerang · Bekasi",
    D: "Bandung",
    A: "Banten",
    T: "Purwakarta · Karawang",
    G: "Pekalongan",
    P: "Besuki · Jember",
    R: "Banyumas · Purwokerto",
    AB: "Yogyakarta",
    AG: "Kediri",
    BE: "Lampung",
  };
  const GROUPS = { bogor: "Bogor Raya", gabungan: "Chapter Gabungan" };
  const ROLES = { member: "Member", admin: "Admin", superadmin: "Superadmin" };
  const AVATAR_GRADIENTS = [
    ["#ff4257", "#b3001b"], ["#ff8a3d", "#d9480f"], ["#f5b301", "#c77700"], ["#2fbf71", "#137a45"],
    ["#22b8cf", "#0b7285"], ["#4c8dff", "#1e4fd8"], ["#7c5cff", "#4a2fd1"], ["#e64bbd", "#a61e80"],
    ["#5b6b84", "#2f3a4d"],
  ];
  const MEMBER_COLUMNS = "key,x_id,name,plate,area,note,grp,city,car_variant,car_color,car_year,bio,avatar_url,updated_at";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function initials(name) {
    const parts = (name || "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function avatarHtml(m, cls = "") {
    if (m.avatar_url) return `<img class="avatar ${cls}" src="${esc(m.avatar_url)}" alt="" loading="lazy" />`;
    let h = 0;
    for (const c of m.key || m.name || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [a, b] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
    return `<div class="avatar ${cls}" style="background:linear-gradient(135deg,${a},${b})">${esc(initials(m.name))}</div>`;
  }

  // Baris tabel members → bentuk data yang dipakai tampilan.
  const toMember = (r) => ({
    key: r.key, id: r.x_id, name: r.name, plate: r.plate, area: r.area, note: r.note, group: r.grp,
    city: r.city, car_variant: r.car_variant, car_color: r.car_color, car_year: r.car_year,
    bio: r.bio, avatar_url: r.avatar_url, updated_at: r.updated_at,
  });

  async function fetchMembers() {
    if (!sb) return { members: window.XMOC_MEMBERS || [], live: false };
    const { data, error } = await sb.from("members").select(MEMBER_COLUMNS).order("key").range(0, 4999);
    if (error) {
      console.warn("Gagal memuat dari Supabase, memakai data cadangan:", error.message);
      return { members: window.XMOC_MEMBERS || [], live: false };
    }
    return { members: data.map(toMember), live: true };
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, kind = "") {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.append(t);
    }
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), kind === "error" ? 4000 : 2000);
  }

  // ---------- tema ----------
  function wireTheme() {
    $("#themeToggle")?.addEventListener("click", () => {
      const root = document.documentElement;
      const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("xmoc-theme", next); } catch {}
    });
  }

  // ---------- auth ----------
  const auth = { session: null, account: null, member: null };
  const listeners = [];
  let isReady = false;
  const onAuth = (cb) => { listeners.push(cb); if (isReady) cb(auth); };
  const isAdmin = () => ["admin", "superadmin"].includes(auth.account?.role);
  const isSuperadmin = () => auth.account?.role === "superadmin";

  async function loadAccount() {
    auth.account = null;
    auth.member = null;
    if (!auth.session) return;
    const { data } = await sb.from("accounts").select("user_id,email,role,member_key").eq("user_id", auth.session.user.id).maybeSingle();
    auth.account = data || { user_id: auth.session.user.id, email: auth.session.user.email, role: "member", member_key: null };
    if (auth.account.member_key) {
      const { data: m } = await sb.from("members").select(MEMBER_COLUMNS).eq("key", auth.account.member_key).maybeSingle();
      auth.member = m ? toMember(m) : null;
    }
  }

  const ready = (async () => {
    if (sb) {
      const { data } = await sb.auth.getSession();
      auth.session = data.session;
      await loadAccount();
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        if (event === "SIGNED_IN" && auth.session?.user.id === session?.user.id) return;
        auth.session = session;
        // Panggilan Supabase di dalam callback ini bisa deadlock, jadi dijalankan setelahnya.
        setTimeout(refreshAccount, 0);
      });
    }
    return auth;
  })();

  async function refreshAccount() {
    await loadAccount();
    renderAuthSlot();
    listeners.forEach((cb) => cb(auth));
  }

  function renderAuthSlot() {
    const slot = $("#authSlot");
    if (!slot || !sb) return;
    if (!auth.session) {
      slot.innerHTML = `<button class="btn sm" data-login>Masuk</button>`;
      return;
    }
    const who = auth.member || { key: auth.account?.email, name: auth.account?.email || "?" };
    slot.innerHTML = `
      <details class="usermenu">
        <summary aria-label="Menu akun">${avatarHtml(who, "sm")}</summary>
        <div class="usermenu-pop">
          <div class="usermenu-head">
            <b>${esc(auth.member?.name || "Belum terhubung ke member")}</b>
            <span>${esc(auth.account?.email || "")}</span>
            ${auth.account?.role !== "member" ? `<span class="role-badge ${auth.account.role}">${ROLES[auth.account.role]}</span>` : ""}
          </div>
          <a href="profile.html">Profil saya</a>
          ${isAdmin() ? `<a href="admin.html">Panel admin</a>` : ""}
          <button data-logout>Keluar</button>
        </div>
      </details>`;
  }

  // ---------- dialog login ----------
  function loginDialog() {
    let dlg = $("#loginDialog");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "loginDialog";
    dlg.className = "sheet";
    dlg.innerHTML = `
      <div class="sheet-inner">
        <button type="button" class="icon-btn close" data-close aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <div class="login-head">
          <img src="assets/logo.svg" alt="" width="52" height="52" />
          <h2>Masuk ke XMOC</h2>
          <p class="muted">Untuk member: ubah profil dan lihat kontak sesama member.</p>
        </div>
        <form id="loginEmail" class="form">
          <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" placeholder="nama@email.com" /></label>
          <button class="btn block" type="submit">Kirim kode masuk</button>
          ${cfg.googleLogin ? `<div class="divider"><span>atau</span></div>
          <button class="btn ghost block" type="button" data-google>
            <svg viewBox="0 0 24 24" style="stroke:none"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.1-2 3.2-4.9 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2v2.9C3.8 20.5 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2C1.3 8.6.9 10.3.9 12s.4 3.4 1.1 4.9L5.8 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.6 2 15 1 12 1 7.6 1 3.8 3.5 2 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z"/></svg>
            Masuk dengan Google</button>` : ""}
        </form>
        <form id="loginCode" class="form" hidden>
          <p class="muted">Kami mengirim email ke <b data-email></b>. Klik link di email tersebut, atau masukkan kode dari email di sini:</p>
          <label class="field"><span>Kode</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required placeholder="123456" class="code-input" /></label>
          <button class="btn block" type="submit">Masuk</button>
          <button class="link-btn" type="button" data-back>Ganti email</button>
        </form>
      </div>`;
    document.body.append(dlg);

    let email = "";
    const redirectTo = location.origin + location.pathname;
    dlg.addEventListener("click", async (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
      if (e.target.closest("[data-back]")) { $("#loginCode", dlg).hidden = true; $("#loginEmail", dlg).hidden = false; }
      if (e.target.closest("[data-google]")) {
        const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
        if (error) toast(error.message, "error");
      }
    });
    $("#loginEmail", dlg).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      email = e.target.email.value.trim();
      busy(btn, true);
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      busy(btn, false);
      if (error) return toast(friendlyAuthError(error), "error");
      $("[data-email]", dlg).textContent = email;
      $("#loginEmail", dlg).hidden = true;
      $("#loginCode", dlg).hidden = false;
      $("#loginCode", dlg).code.focus();
    });
    $("#loginCode", dlg).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      busy(btn, true);
      const { error } = await sb.auth.verifyOtp({ email, token: e.target.code.value.trim(), type: "email" });
      busy(btn, false);
      if (error) return toast("Kode salah atau kedaluwarsa", "error");
      dlg.close();
      toast("Berhasil masuk");
    });
    return dlg;
  }

  function friendlyAuthError(error) {
    if (/rate limit|too many/i.test(error.message)) return "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.";
    return error.message;
  }

  function openLogin() {
    if (!sb) return toast("Login belum diaktifkan");
    const dlg = loginDialog();
    $("#loginCode", dlg).hidden = true;
    $("#loginEmail", dlg).hidden = false;
    dlg.showModal();
  }

  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle("loading", on);
  }

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-login]")) openLogin();
    if (e.target.closest("[data-logout]")) {
      await sb.auth.signOut();
      toast("Anda sudah keluar");
      if (/admin\.html|profile\.html/.test(location.pathname)) location.href = "./";
    }
    const menu = $(".usermenu[open]");
    if (menu && !menu.contains(e.target)) menu.open = false;
  });

  // ---------- foto profil ----------
  // Foto diperkecil ke 512px JPEG di browser sebelum diunggah, agar hemat kuota storage.
  async function resizeImage(file, size = 512) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  }

  async function uploadAvatar(file, folder = auth.session.user.id) {
    const blob = await resizeImage(file);
    const path = `${folder}/avatar-${Date.now()}.jpg`;
    const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  function waLink(number) {
    let n = String(number || "").replace(/\D/g, "");
    if (n.startsWith("0")) n = "62" + n.slice(1);
    return n ? `https://wa.me/${n}` : null;
  }

  wireTheme();
  ready.then(() => {
    isReady = true;
    renderAuthSlot();
    listeners.forEach((cb) => cb(auth));
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  window.XMOC = {
    cfg, sb, enabled, AREAS, GROUPS, ROLES, MEMBER_COLUMNS,
    $, $$, esc, initials, avatarHtml, toMember, fetchMembers, toast, busy, waLink,
    auth, ready, onAuth, refreshAccount, isAdmin, isSuperadmin, openLogin, uploadAvatar,
  };
})();

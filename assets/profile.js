(() => {
  "use strict";

  const { sb, enabled, auth, $, esc, toast, busy, avatarHtml, onAuth, refreshAccount, MEMBER_COLUMNS, toMember } = window.XMOC;
  const body = $("#profileBody");

  const card = (html) => `<div class="card">${html}</div>`;

  async function show() {
    if (!enabled) {
      body.innerHTML = card(`<h2>Login belum diaktifkan</h2><p class="muted">Admin perlu menghubungkan situs ini ke Supabase terlebih dahulu.</p>`);
      return;
    }
    if (!auth.session) {
      body.innerHTML = card(`
        <div class="empty-state">
          <img src="assets/logo.svg" alt="" width="56" height="56" />
          <h2>Masuk untuk mengelola profil</h2>
          <p class="muted">Gunakan email Anda. Kami akan mengirim kode masuk, tanpa perlu password.</p>
          <button class="btn" data-login>Masuk</button>
        </div>`);
      return;
    }
    if (auth.member) return showEditor();
    return showClaim();
  }

  // ---------- belum terhubung: ajukan klaim X-ID ----------
  async function showClaim() {
    const [{ data: claims }, { data: rows }] = await Promise.all([
      sb.from("claims").select("id,member_key,status,created_at").order("created_at", { ascending: false }).limit(1),
      sb.from("members").select("key,x_id,name,plate").order("key").range(0, 4999),
    ]);
    const last = claims?.[0];
    const byKey = new Map((rows || []).map((r) => [r.key, r]));
    const label = (r) => [r.x_id || "Tanpa X-ID", r.name, r.plate].filter(Boolean).join(" · ");

    if (last?.status === "pending") {
      const r = byKey.get(last.member_key);
      body.innerHTML = card(`
        <div class="status-box pending">
          <span class="status-dot"></span>
          <div>
            <h2>Menunggu persetujuan admin</h2>
            <p>Anda mengajukan diri sebagai <b>${esc(r ? label(r) : last.member_key)}</b>. Setelah disetujui, Anda bisa mengubah profil di sini.</p>
          </div>
        </div>
        <button class="btn ghost" data-cancel="${last.id}">Batalkan pengajuan</button>`);
      $("[data-cancel]", body).onclick = async (e) => {
        const { error } = await sb.from("claims").delete().eq("id", last.id);
        if (error) return toast(error.message, "error");
        toast("Pengajuan dibatalkan");
        show();
      };
      return;
    }

    body.innerHTML = card(`
      ${last?.status === "rejected" ? `<div class="status-box rejected"><span class="status-dot"></span><p>Pengajuan sebelumnya ditolak admin. Pastikan Anda memilih data yang benar, atau hubungi admin.</p></div>` : ""}
      <h2>Hubungkan akun ke data member</h2>
      <p class="muted">Akun <b>${esc(auth.account.email)}</b> belum terhubung. Pilih data member Anda; admin akan memverifikasi.</p>
      <form class="form" id="claimForm">
        <label class="field"><span>Cari nama, X-ID, atau plat</span>
          <input name="member" list="dl-members" required autocomplete="off" placeholder="mis. X-1085 atau Ahyo" />
        </label>
        <datalist id="dl-members">${(rows || []).map((r) => `<option value="${esc(label(r))}">`).join("")}</datalist>
        <label class="field"><span>Pesan untuk admin (opsional)</span>
          <textarea name="message" rows="2" maxlength="280" placeholder="mis. nomor WA yang terdaftar di grup"></textarea>
        </label>
        <button class="btn" type="submit">Ajukan</button>
      </form>`);

    $("#claimForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const chosen = (rows || []).find((r) => label(r) === f.member.value.trim());
      if (!chosen) return toast("Pilih member dari daftar yang muncul", "error");
      busy(e.submitter, true);
      const { error } = await sb.from("claims").insert({ member_key: chosen.key, message: f.message.value.trim() || null });
      busy(e.submitter, false);
      if (error) return toast(error.code === "23505" ? "Anda masih punya pengajuan yang menunggu" : error.message, "error");
      toast("Pengajuan terkirim");
      show();
    });
  }

  // ---------- sudah terhubung: edit profil ----------
  async function showEditor() {
    const m = auth.member;
    const { data: contacts } = await sb.from("member_contacts").select("whatsapp,instagram").eq("member_key", m.key).maybeSingle();
    body.innerHTML = `
      <div class="card profile-hero">
        ${avatarHtml(m, "lg")}
        <div>
          <div class="xid">${esc(m.id || "Belum ada X-ID")}</div>
          <h2>${esc(m.name)}</h2>
          <a class="link-btn" href="./?m=${encodeURIComponent(m.key)}">Lihat di direktori →</a>
        </div>
      </div>
      <div class="card" id="formWrap"></div>`;
    const { form, collect } = window.XMOC.memberForm.render($("#formWrap"), m, contacts || {});
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let data;
      try { data = collect(); } catch (err) { return toast(err.message, "error"); }
      busy(e.submitter, true);
      try {
        await window.XMOC.memberForm.save(m.key, data);
        const { data: fresh } = await sb.from("members").select(MEMBER_COLUMNS).eq("key", m.key).single();
        auth.member = toMember(fresh);
        toast("Profil tersimpan");
        await refreshAccount();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        busy(e.submitter, false);
      }
    });
  }

  onAuth(show);
})();

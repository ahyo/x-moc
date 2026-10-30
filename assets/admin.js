(() => {
  "use strict";

  const X = window.XMOC;
  const { sb, enabled, auth, $, $$, esc, toast, busy, avatarHtml, onAuth, isAdmin, isSuperadmin, ROLES, GROUPS, MEMBER_COLUMNS, toMember } = X;

  let members = [];
  let accounts = [];
  let started = false;

  const memberLabel = (m) => [m.id || "Tanpa X-ID", m.name, m.plate].filter(Boolean).join(" · ");
  const fmtTime = (t) => new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const norm = (s) => (s || "").toLowerCase().replace(/[\s\-./]/g, "");

  async function loadMembers() {
    const { data, error } = await sb.from("members").select(MEMBER_COLUMNS).order("key").range(0, 4999);
    if (error) throw error;
    members = data.map(toMember).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (a.id || a.key).localeCompare(b.id || b.key));
  }

  async function loadAccounts() {
    const { data, error } = await sb.from("accounts").select("user_id,email,role,member_key,created_at").order("created_at");
    if (error) throw error;
    accounts = data;
  }

  // ---------- gate ----------
  async function gate() {
    const g = $("#adminGate");
    if (!enabled) {
      g.innerHTML = `<div class="card"><h2>Supabase belum terhubung</h2><p class="muted">Isi <code>assets/config.js</code> dengan URL dan anon key proyek Supabase. Lihat README.</p></div>`;
      return;
    }
    if (!auth.session) {
      g.innerHTML = `<div class="card empty-state"><h2>Masuk sebagai admin</h2><button class="btn" data-login>Masuk</button></div>`;
      $("#adminApp").hidden = true;
      return;
    }
    if (!isAdmin()) {
      g.innerHTML = `<div class="card empty-state"><h2>Tidak punya akses</h2><p class="muted">Akun <b>${esc(auth.account?.email)}</b> bukan admin. Minta superadmin untuk memberi akses.</p><a class="btn ghost" href="./">Kembali ke direktori</a></div>`;
      $("#adminApp").hidden = true;
      return;
    }
    g.innerHTML = "";
    $("#adminApp").hidden = false;
    $("#adminWho").innerHTML = `Masuk sebagai <b>${esc(auth.account.email)}</b> <span class="role-badge ${auth.account.role}">${ROLES[auth.account.role]}</span>`;
    if (started) return;
    started = true;
    await Promise.all([loadMembers(), loadAccounts()]);
    renderMembers();
    renderClaims();
    const edit = new URLSearchParams(location.search).get("edit");
    if (edit) openEdit(edit);
  }

  // ---------- tabs ----------
  const loaders = { members: renderMembers, claims: renderClaims, users: renderUsers, log: renderLog };
  $$(".tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
    $$(".tabs [data-tab]").forEach((x) => x.classList.toggle("active", x === b));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
    loaders[b.dataset.tab]?.();
  }));

  // ---------- member ----------
  function renderMembers() {
    const q = norm($("#memberQ").value);
    const linked = new Map(accounts.filter((a) => a.member_key).map((a) => [a.member_key, a]));
    const list = q ? members.filter((m) => norm([m.id, m.name, m.plate, m.note, m.city].join(" ")).includes(q)) : members;
    $("#memberMeta").innerHTML = `<b>${list.length}</b> dari ${members.length} member`;
    $("#memberRows").innerHTML = list.slice(0, 400).map((m) => `
      <tr>
        <td><span class="xid">${esc(m.id || "—")}</span></td>
        <td><div class="who">${avatarHtml(m)}<span>${esc(m.name)}${m.note ? `<small class="muted"> · ${esc(m.note)}</small>` : ""}</span></div></td>
        <td>${m.plate ? `<span class="plate sm"><span>${esc(m.plate)}</span></span>` : `<span class="muted">—</span>`}</td>
        <td class="hide-sm">${GROUPS[m.group]}</td>
        <td class="hide-sm">${linked.has(m.key) ? `<span class="pill ok" title="${esc(linked.get(m.key).email)}">Terhubung</span>` : `<span class="muted">—</span>`}</td>
        <td class="actions">
          <button class="btn ghost sm" data-edit="${esc(m.key)}">Edit</button>
          <button class="icon-btn danger" data-del="${esc(m.key)}" title="Hapus" aria-label="Hapus ${esc(m.name)}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button>
        </td>
      </tr>`).join("");
  }

  let qTimer;
  $("#memberQ").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(renderMembers, 100); });
  $("#addMember").addEventListener("click", () => openEdit(null));
  $("#memberRows").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]");
    if (edit) return openEdit(edit.dataset.edit);
    const del = e.target.closest("[data-del]");
    if (del) {
      const m = members.find((x) => x.key === del.dataset.del);
      if (!confirm(`Hapus ${memberLabel(m)}?\n\nProfil, kontak, dan tautan akunnya juga akan terhapus.`)) return;
      const { error } = await sb.from("members").delete().eq("key", m.key);
      if (error) return toast(error.message, "error");
      toast(`${m.name} dihapus`);
      await Promise.all([loadMembers(), loadAccounts()]);
      renderMembers();
    }
  });

  async function openEdit(key) {
    const isNew = !key;
    const m = isNew ? { group: "bogor" } : members.find((x) => x.key === key);
    if (!m) return toast("Member tidak ditemukan", "error");
    const { data: contacts } = isNew ? { data: null } : await sb.from("member_contacts").select("whatsapp,instagram").eq("member_key", key).maybeSingle();
    $("#editTitle").textContent = isNew ? "Tambah member" : `Edit ${m.name}`;
    const { form, collect } = X.memberForm.render($("#editBody"), m, contacts || {}, { admin: true, isNew });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let data;
      try { data = collect(); } catch (err) { return toast(err.message, "error"); }
      busy(e.submitter, true);
      try {
        await X.memberForm.save(key, data, { isNew });
        toast(isNew ? "Member ditambahkan" : "Perubahan tersimpan");
        $("#editDialog").close();
        await loadMembers();
        renderMembers();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        busy(e.submitter, false);
      }
    });
    $("#editDialog").showModal();
  }

  $("#editDialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget || e.target.closest("[data-close]")) e.currentTarget.close();
  });
  $("#editDialog").addEventListener("close", () => {
    if (new URLSearchParams(location.search).has("edit")) history.replaceState(null, "", location.pathname);
  });

  // ---------- klaim ----------
  async function renderClaims() {
    const { data, error } = await sb.from("claims").select("id,user_id,member_key,message,status,created_at,reviewed_at").order("created_at", { ascending: false }).limit(60);
    if (error) return toast(error.message, "error");
    const byKey = new Map(members.map((m) => [m.key, m]));
    const email = (uid) => accounts.find((a) => a.user_id === uid)?.email || "(akun dihapus)";
    const pending = data.filter((c) => c.status === "pending");
    const done = data.filter((c) => c.status !== "pending").slice(0, 20);
    const badge = $("#claimBadge");
    badge.hidden = !pending.length;
    badge.textContent = pending.length;

    const item = (c) => {
      const m = byKey.get(c.member_key);
      const taken = accounts.find((a) => a.member_key === c.member_key && a.user_id !== c.user_id);
      return `<div class="claim">
        ${m ? avatarHtml(m) : ""}
        <div class="claim-body">
          <b>${esc(email(c.user_id))}</b> mengaku sebagai <b>${esc(m ? memberLabel(m) : c.member_key)}</b>
          ${c.message ? `<p class="claim-msg">“${esc(c.message)}”</p>` : ""}
          ${taken ? `<p class="warn">⚠ Member ini sudah terhubung ke ${esc(taken.email)}</p>` : ""}
          <small class="muted">${fmtTime(c.created_at)}</small>
        </div>
        ${c.status === "pending"
          ? `<div class="claim-actions"><button class="btn sm" data-approve="${c.id}">Setujui</button><button class="btn ghost sm" data-reject="${c.id}">Tolak</button></div>`
          : `<span class="pill ${c.status === "approved" ? "ok" : "bad"}">${c.status === "approved" ? "Disetujui" : "Ditolak"}</span>`}
      </div>`;
    };

    $("#claimList").innerHTML = `
      <h3>Menunggu persetujuan</h3>
      ${pending.length ? `<div class="card list">${pending.map(item).join("")}</div>` : `<div class="card muted">Tidak ada klaim yang menunggu.</div>`}
      ${done.length ? `<h3>Riwayat terakhir</h3><div class="card list">${done.map(item).join("")}</div>` : ""}`;
  }

  $("#claimList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-approve],[data-reject]");
    if (!b) return;
    const approve = "approve" in b.dataset;
    busy(b, true);
    const { error } = await sb.rpc("review_claim", { p_claim: Number(b.dataset.approve || b.dataset.reject), p_approve: approve });
    busy(b, false);
    if (error) return toast(error.message, "error");
    toast(approve ? "Klaim disetujui" : "Klaim ditolak");
    await loadAccounts();
    renderClaims();
  });

  // ---------- pengguna ----------
  async function renderUsers() {
    await loadAccounts();
    const byKey = new Map(members.map((m) => [m.key, m]));
    const sup = isSuperadmin();
    $("#userRows").innerHTML = accounts.map((a) => {
      const m = a.member_key && byKey.get(a.member_key);
      const self = a.user_id === auth.session.user.id;
      return `<tr>
        <td>${esc(a.email)}${self ? ` <small class="muted">(Anda)</small>` : ""}</td>
        <td>${m ? `<div class="who">${avatarHtml(m)}<span>${esc(memberLabel(m))}</span></div>` : `<span class="muted">Belum terhubung</span>`}</td>
        <td>${sup
          ? `<select data-role="${a.user_id}" aria-label="Peran ${esc(a.email)}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${a.role === k ? " selected" : ""}>${v}</option>`).join("")}</select>`
          : `<span class="role-badge ${a.role}">${ROLES[a.role]}</span>`}</td>
        <td class="actions">${m
          ? `<button class="btn ghost sm" data-unlink="${a.user_id}">Lepas</button>`
          : `<button class="btn ghost sm" data-link="${a.user_id}">Hubungkan</button>`}</td>
      </tr>`;
    }).join("");
    renderInvites();
  }

  async function renderInvites() {
    const box = $("#inviteBox");
    if (!isSuperadmin()) {
      box.innerHTML = `<p class="hint">Hanya superadmin yang bisa mengubah peran pengguna.</p>`;
      return;
    }
    const { data } = await sb.from("role_invites").select("email,role,created_at").order("created_at");
    box.innerHTML = `
      <div class="card">
        <h3>Undang admin lewat email</h3>
        <p class="muted">Peran langsung berlaku saat orang tersebut login pertama kali. Untuk pengguna yang sudah terdaftar, ubah perannya di tabel di bawah.</p>
        <form class="inline-form" id="inviteForm">
          <input type="email" name="email" required placeholder="email@contoh.com" />
          <select name="role"><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select>
          <button class="btn" type="submit">Undang</button>
        </form>
        ${data?.length ? `<ul class="invite-list">${data.map((i) => `<li><span>${esc(i.email)}</span><span class="role-badge ${i.role}">${ROLES[i.role]}</span><button class="link-btn" data-uninvite="${esc(i.email)}">Batalkan</button></li>`).join("")}</ul>` : ""}
      </div>`;
    $("#inviteForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim().toLowerCase();
      if (accounts.some((a) => a.email?.toLowerCase() === email)) return toast("Email ini sudah terdaftar; ubah perannya di tabel", "error");
      const { error } = await sb.from("role_invites").upsert({ email, role: e.target.role.value });
      if (error) return toast(error.message, "error");
      toast("Undangan disimpan");
      renderInvites();
    });
  }

  $("#inviteBox").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-uninvite]");
    if (!b) return;
    const { error } = await sb.from("role_invites").delete().eq("email", b.dataset.uninvite);
    if (error) return toast(error.message, "error");
    renderInvites();
  });

  $("#userRows").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-role]");
    if (!s) return;
    const a = accounts.find((x) => x.user_id === s.dataset.role);
    if (!confirm(`Ubah peran ${a.email} menjadi ${ROLES[s.value]}?`)) { s.value = a.role; return; }
    const { error } = await sb.rpc("set_role", { p_user: a.user_id, p_role: s.value });
    if (error) { s.value = a.role; return toast(error.message, "error"); }
    toast("Peran diperbarui");
    if (a.user_id === auth.session.user.id) return X.refreshAccount();
    renderUsers();
  });

  $("#userRows").addEventListener("click", async (e) => {
    const unlink = e.target.closest("[data-unlink]");
    const link = e.target.closest("[data-link]");
    if (!unlink && !link) return;
    let key = null;
    if (link) {
      const input = prompt("Ketik X-ID member yang akan dihubungkan (mis. X-1085):");
      if (!input) return;
      const m = members.find((x) => (x.id || x.key).toUpperCase() === input.trim().toUpperCase());
      if (!m) return toast("X-ID tidak ditemukan", "error");
      key = m.key;
    } else if (!confirm("Lepaskan akun ini dari data member?")) return;
    const uid = link ? link.dataset.link : unlink.dataset.unlink;
    const { error } = await sb.rpc("admin_link_account", { p_user: uid, p_member_key: key });
    if (error) return toast(error.message, "error");
    toast(key ? "Akun terhubung" : "Akun dilepas");
    renderUsers();
  });

  // ---------- impor ----------
  const BASE_FIELDS = { id: "X-ID", name: "Nama", plate: "Plat", note: "Keterangan", group: "Chapter" };
  const COLUMN_LABELS = {
    key: "Kunci", x_id: "X-ID", name: "Nama", plate: "Plat", area: "Wilayah", note: "Keterangan", grp: "Chapter",
    city: "Domisili", car_variant: "Tipe", car_color: "Warna", car_year: "Tahun", bio: "Bio", avatar_url: "Foto",
  };
  let pendingImport = null;

  $("#importPreview").addEventListener("click", () => {
    const { members: incoming, errors } = window.XMOC_PARSE.parseWhatsApp($("#importText").value);
    if (!incoming.length) return toast("Tidak ada baris member yang terbaca", "error");

    // Cocokkan berdasarkan X-ID dulu (kunci bisa berbeda bila X-ID ditambahkan belakangan), lalu kunci.
    const byId = new Map(members.filter((m) => m.id).map((m) => [m.id, m]));
    const byKey = new Map(members.map((m) => [m.key, m]));
    const added = [], changed = [], seen = new Set();
    for (const n of incoming) {
      const cur = (n.id && byId.get(n.id)) || byKey.get(n.key) || (!n.id && members.find((m) => !m.id && m.name.toLowerCase() === n.name.toLowerCase()));
      if (!cur) { added.push(n); continue; }
      seen.add(cur.key);
      const diffs = Object.keys(BASE_FIELDS).filter((f) => (cur[f] || null) !== (n[f] || null));
      if (diffs.length) changed.push({ cur, next: n, diffs });
    }
    const missing = members.filter((m) => !seen.has(m.key));
    pendingImport = { added, changed, missing };

    const diffText = (c) => c.diffs.map((f) => `<span class="chg"><b>${BASE_FIELDS[f]}:</b> <s>${esc(f === "group" ? GROUPS[c.cur[f]] : c.cur[f] || "—")}</s> → ${esc(f === "group" ? GROUPS[c.next[f]] : c.next[f] || "—")}</span>`).join("");
    $("#importResult").innerHTML = `
      <div class="card">
        <div class="import-summary">
          <div><b>${incoming.length}</b><span>terbaca</span></div>
          <div class="ok"><b>${added.length}</b><span>baru</span></div>
          <div class="mid"><b>${changed.length}</b><span>berubah</span></div>
          <div class="bad"><b>${missing.length}</b><span>tidak ada di daftar</span></div>
        </div>
        ${errors.length ? `<div class="status-box rejected"><span class="status-dot"></span><div><b>Baris tidak terbaca:</b><br>${errors.map(esc).join("<br>")}</div></div>` : ""}
        ${added.length ? `<h4>Member baru</h4><ul class="diff-list">${added.map((n) => `<li class="add">${esc(memberLabel(n))}${n.note ? ` <small class="muted">(${esc(n.note)})</small>` : ""}</li>`).join("")}</ul>` : ""}
        ${changed.length ? `<h4>Berubah</h4><ul class="diff-list">${changed.map((c) => `<li class="chg-row"><span>${esc(c.cur.id || c.cur.name)}</span>${diffText(c)}</li>`).join("")}</ul>` : ""}
        ${missing.length ? `<h4>Ada di database tapi tidak ada di daftar</h4><ul class="diff-list">${missing.map((m) => `<li class="del">${esc(memberLabel(m))}</li>`).join("")}</ul>
          <label class="check"><input type="checkbox" id="importDelete" /> Hapus ${missing.length} member ini dari database</label>` : ""}
        ${added.length || changed.length || missing.length
          ? `<div class="form-actions"><button class="btn" id="importApply">Terapkan perubahan</button></div>`
          : `<p class="muted">Tidak ada perubahan. Database sudah sesuai dengan daftar.</p>`}
      </div>`;
    $("#importApply")?.addEventListener("click", applyImport);
  });

  async function applyImport(e) {
    const { added, changed, missing } = pendingImport;
    const del = $("#importDelete")?.checked;
    const toRow = (n, key) => ({ key, x_id: n.id, name: n.name, plate: n.plate, area: n.area, note: n.note, grp: n.group });
    const rows = [...added.map((n) => toRow(n, n.key)), ...changed.map((c) => toRow(c.next, c.cur.key))];
    const summary = `${added.length} baru, ${changed.length} berubah${del ? `, ${missing.length} dihapus` : ""}`;
    if (!confirm(`Terapkan: ${summary}?`)) return;
    busy(e.target, true);
    try {
      if (rows.length) {
        const { error } = await sb.from("members").upsert(rows, { onConflict: "key" });
        if (error) throw X.memberForm.friendly(error);
      }
      if (del && missing.length) {
        const { error } = await sb.from("members").delete().in("key", missing.map((m) => m.key));
        if (error) throw error;
      }
      toast(`Impor selesai: ${summary}`);
      $("#importResult").innerHTML = "";
      $("#importText").value = "";
      await Promise.all([loadMembers(), loadAccounts()]);
      renderMembers();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      busy(e.target, false);
    }
  }

  // ---------- log ----------
  async function renderLog() {
    const { data, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(150);
    if (error) return toast(error.message, "error");
    const detail = (l) => {
      if (l.action === "ubah member" && l.detail) {
        return Object.entries(l.detail).map(([k, v]) => k === "avatar_url"
          ? `<span class="chg"><b>Foto:</b> ${v.jadi ? "diganti" : "dihapus"}</span>`
          : `<span class="chg"><b>${esc(COLUMN_LABELS[k] || k)}:</b> <s>${esc(v.dari ?? "—")}</s> → ${esc(v.jadi ?? "—")}</span>`).join("");
      }
      if (l.detail?.email) return esc(l.detail.email);
      if (l.detail?.peran) return esc(ROLES[l.detail.peran]);
      if (l.detail?.name) return esc(l.detail.name);
      return "";
    };
    $("#logList").innerHTML = data.length
      ? `<div class="card list">${data.map((l) => `
          <div class="log-row">
            <div class="log-meta"><b>${esc(l.actor_email || "sistem")}</b> <span class="pill">${esc(l.action)}</span> <span class="xid">${esc(l.target || "")}</span></div>
            <div class="log-detail">${detail(l)}</div>
            <small class="muted">${fmtTime(l.created_at)}</small>
          </div>`).join("")}</div>`
      : `<div class="card muted">Belum ada aktivitas.</div>`;
  }

  onAuth(() => gate().catch((err) => toast(err.message, "error")));
})();

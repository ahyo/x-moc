// Formulir data member, dipakai halaman Profil (member sendiri) dan Panel Admin (semua kolom).
(() => {
  "use strict";

  const { $, esc, avatarHtml, sb, uploadAvatar } = window.XMOC;
  const { parsePlate, keyFor } = window.XMOC_PARSE;

  const VARIANTS = ["GLS", "GLX", "Exceed", "Sport", "Ultimate", "Cross", "Cross Premium", "Cross Rockford Fosgate Black Edition"];
  const COLORS = ["Putih", "Hitam", "Silver", "Abu-abu", "Merah", "Coklat", "Biru", "Oranye", "Hijau"];

  const field = (label, input, hint = "") =>
    `<label class="field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
  const text = (name, value, attrs = "") => `<input name="${name}" value="${esc(value ?? "")}" ${attrs} />`;

  function render(container, member = {}, contacts = {}, { admin = false, isNew = false } = {}) {
    const m = member;
    container.innerHTML = `
      <form class="form member-form" novalidate>
        <div class="avatar-edit">
          <div data-avatar-preview>${avatarHtml({ ...m, name: m.name || "?" }, "xl")}</div>
          <div class="avatar-actions">
            <label class="btn ghost sm">Ganti foto<input type="file" name="avatar" accept="image/*" hidden /></label>
            ${m.avatar_url ? `<button type="button" class="link-btn" data-remove-avatar>Hapus foto</button>` : ""}
            <small class="muted">JPG/PNG, otomatis diperkecil.</small>
          </div>
        </div>

        <fieldset>
          <legend>Data keanggotaan</legend>
          ${admin ? `
            <div class="row-2">
              ${field("Nomor member (X-ID)", text("x_id", m.id, `placeholder="X-1234" pattern="X-\\d{4}"`), "Kosongkan jika belum punya.")}
              ${field("Chapter", `<select name="grp"><option value="bogor">Bogor Raya</option><option value="gabungan"${m.group === "gabungan" ? " selected" : ""}>Chapter Gabungan</option></select>`)}
            </div>
            ${field("Nama", text("name", m.name, "required maxlength=60"))}
            ${field("Keterangan", text("note", m.note, `maxlength=60 placeholder="mis. ex Yogya, Solo"`))}
          ` : `
            <div class="row-2">
              ${field("Nomor member", text("x_id_ro", m.id || "Belum ada X-ID", "readonly"))}
              ${field("Nama", text("name_ro", m.name, "readonly"))}
            </div>
            <p class="hint">Nomor member dan nama dikelola admin. Hubungi admin jika ada yang salah.</p>
          `}
          ${field("Plat nomor", text("plate", m.plate, `placeholder="F 1234 ABC" autocapitalize="characters"`))}
        </fieldset>

        <fieldset>
          <legend>Profil</legend>
          ${field("Domisili", text("city", m.city, `maxlength=60 placeholder="mis. Cibinong"`))}
          <div class="row-3">
            ${field("Tipe Xpander", text("car_variant", m.car_variant, `list="dl-variant" maxlength=40`))}
            ${field("Warna", text("car_color", m.car_color, `list="dl-color" maxlength=30`))}
            ${field("Tahun", text("car_year", m.car_year, `type="number" min="2017" max="${new Date().getFullYear() + 1}" inputmode="numeric"`))}
          </div>
          ${field("Bio singkat", `<textarea name="bio" maxlength="280" rows="3" placeholder="Ceritakan sedikit tentang Anda dan Xpander Anda">${esc(m.bio ?? "")}</textarea>`)}
        </fieldset>

        <fieldset>
          <legend>Kontak <span class="legend-note">hanya terlihat oleh sesama member terverifikasi</span></legend>
          <div class="row-2">
            ${field("WhatsApp", text("whatsapp", contacts.whatsapp, `type="tel" inputmode="tel" placeholder="0812xxxxxxx" maxlength=20`))}
            ${field("Instagram", text("instagram", contacts.instagram, `placeholder="@username" maxlength=40`))}
          </div>
        </fieldset>

        <div class="form-actions">
          <button class="btn" type="submit">${isNew ? "Tambah member" : "Simpan perubahan"}</button>
        </div>
      </form>
      <datalist id="dl-variant">${VARIANTS.map((v) => `<option value="${v}">`).join("")}</datalist>
      <datalist id="dl-color">${COLORS.map((v) => `<option value="${v}">`).join("")}</datalist>`;

    const form = $("form", container);
    let avatarFile = null;
    let removeAvatar = false;
    form.avatar.addEventListener("change", () => {
      avatarFile = form.avatar.files[0] || null;
      if (!avatarFile) return;
      removeAvatar = false;
      $("[data-avatar-preview]", form).innerHTML = `<img class="avatar xl" src="${URL.createObjectURL(avatarFile)}" alt="" />`;
    });
    $("[data-remove-avatar]", form)?.addEventListener("click", () => {
      avatarFile = null;
      removeAvatar = true;
      $("[data-avatar-preview]", form).innerHTML = avatarHtml({ ...m, avatar_url: null }, "xl");
    });

    // Mengembalikan { row, contacts, avatarFile, removeAvatar } atau melempar Error berisi pesan validasi.
    function collect() {
      const v = (n) => (form[n]?.value ?? "").trim() || null;
      const plate = parsePlate(v("plate"));
      if (!plate) throw new Error("Format plat tidak dikenali. Contoh: F 1234 ABC");
      const year = v("car_year") ? Number(v("car_year")) : null;
      if (year && (year < 2017 || year > new Date().getFullYear() + 1)) throw new Error("Tahun kendaraan tidak valid");
      const row = { plate: plate.plate, area: plate.area, city: v("city"), car_variant: v("car_variant"), car_color: v("car_color"), car_year: year, bio: v("bio") };
      if (admin) {
        const xid = v("x_id")?.toUpperCase() || null;
        if (xid && !/^X-\d{4}$/.test(xid)) throw new Error("Format X-ID harus X-1234");
        if (!v("name")) throw new Error("Nama wajib diisi");
        Object.assign(row, { x_id: xid, name: v("name"), note: v("note"), grp: form.grp.value });
      }
      return {
        row,
        contacts: { whatsapp: v("whatsapp")?.replace(/[^\d+]/g, "") || null, instagram: v("instagram")?.replace(/^@/, "") || null },
        avatarFile,
        removeAvatar,
      };
    }

    return { form, collect };
  }

  // Menyimpan hasil collect(). Mengembalikan key member yang tersimpan.
  async function save(key, data, { isNew = false } = {}) {
    const row = { ...data.row };
    if (data.avatarFile) row.avatar_url = await uploadAvatar(data.avatarFile);
    else if (data.removeAvatar) row.avatar_url = null;

    if (isNew) {
      key = keyFor(row.x_id, row.name);
      const { error } = await sb.from("members").insert({ key, ...row });
      if (error) throw friendly(error);
    } else {
      const { error } = await sb.from("members").update(row).eq("key", key);
      if (error) throw friendly(error);
    }

    const { error } = await sb.from("member_contacts").upsert({ member_key: key, ...data.contacts, updated_at: new Date().toISOString() });
    if (error) throw friendly(error);
    return key;
  }

  function friendly(error) {
    if (error.code === "23505") return new Error("X-ID atau data ini sudah dipakai member lain");
    if (error.code === "42501") return new Error("Anda tidak punya izin untuk perubahan ini");
    return new Error(error.message);
  }

  window.XMOC.memberForm = { render, save, friendly };
})();

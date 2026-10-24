(() => {
  "use strict";

  const MEMBERS = window.XMOC_MEMBERS || [];

  // Kode wilayah plat nomor Indonesia (yang dipakai member).
  const AREAS = {
    F: "Bogor · Sukabumi · Cianjur",
    B: "Jakarta · Depok · Tangerang · Bekasi",
    D: "Bandung",
    A: "Banten",
    T: "Purwakarta · Karawang",
    G: "Pekalongan",
    P: "Besuki · Jember",
    AB: "Yogyakarta",
    AG: "Kediri",
    BE: "Lampung",
  };
  const GROUPS = { bogor: "Bogor Raya", gabungan: "Chapter Gabungan" };
  const AVATAR_GRADIENTS = [
    ["#ff4257", "#b3001b"], ["#ff8a3d", "#d9480f"], ["#f5b301", "#c77700"], ["#2fbf71", "#137a45"],
    ["#22b8cf", "#0b7285"], ["#4c8dff", "#1e4fd8"], ["#7c5cff", "#4a2fd1"], ["#e64bbd", "#a61e80"],
    ["#5b6b84", "#2f3a4d"],
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = { q: "", filter: "all", sort: "id", view: "grid" };

  // ---------- helpers ----------
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const compact = (s) => norm(s).replace(/[\s\-./]/g, "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function initials(name) {
    const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function avatarStyle(m) {
    let h = 0;
    for (const c of m.key) h =(h * 31 + c.charCodeAt(0)) >>> 0;
    const [a, b] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
    return `background:linear-gradient(135deg,${a},${b})`;
  }

  // Menandai bagian teks yang cocok dengan kata kunci, toleran terhadap spasi pada plat.
  function highlight(text, q) {
    if (!q || !text) return esc(text ?? "");
    const needle = compact(q);
    if (!needle) return esc(text);
    const chars = [...text];
    const map = [];
    let flat = "";
    chars.forEach((c, i) => {
      const n = compact(c);
      for (const ch of n) { flat += ch; map.push(i); }
    });
    const at = flat.indexOf(needle);
    if (at < 0) return esc(text);
    const start = map[at];
    const end = map[at + needle.length - 1] + 1;
    return esc(chars.slice(0, start).join("")) + "<mark>" + esc(chars.slice(start, end).join("")) + "</mark>" + esc(chars.slice(end).join(""));
  }

  const plateHtml = (m, q, cls = "") =>
    m.plate
      ? `<span class="plate ${cls}"><span>${highlight(m.plate, q)}</span></span>`
      : `<span class="plate none ${cls}">Plat belum terdata</span>`;

  const idHtml = (m, q) => (m.id ? highlight(m.id, q) : `<span class="muted">Belum ada X-ID</span>`);

  const searchKey = new Map(MEMBERS.map((m) => [m, compact([m.id, (m.id || "").replace("X-", ""), m.name, m.plate, m.note].join(" "))]));
  const nameKey = new Map(MEMBERS.map((m) => [m, compact(m.name)]));

  // ---------- filtering ----------
  function filtered() {
    const q = compact(state.q);
    let list = MEMBERS.filter((m) => {
      if (state.filter === "gabungan" && m.group !== "gabungan") return false;
      if (state.filter === "none" && m.plate) return false;
      if (state.filter.startsWith("area:") && m.area !== state.filter.slice(5)) return false;
      if (q) {
        // Pencarian per kata agar "andri f" tetap ketemu "Andri M Fajar".
        const words = norm(state.q).split(/\s+/).map(compact).filter(Boolean);
        const hay = searchKey.get(m);
        if (!hay.includes(q) && !words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by = {
      id: (a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (a.id || "").localeCompare(b.id || ""),
      name: (a, b) => nameKey.get(a).localeCompare(nameKey.get(b)),
      plate: (a, b) => (a.plate ? 0 : 1) - (b.plate ? 0 : 1) || (a.plate || "").localeCompare(b.plate || "", "id", { numeric: true }),
    }[state.sort];
    return list.sort(by);
  }

  // ---------- rendering ----------
  function cardHtml(m, i) {
    const tag = m.group === "gabungan"
      ? `<span class="tag gold">${esc(m.note ? "Gabungan · " + m.note : "Chapter Gabungan")}</span>`
      : m.area && AREAS[m.area]
        ? `<span class="tag">${esc(AREAS[m.area].split(" · ")[0])}</span>`
        : m.note ? `<span class="tag">${esc(m.note)}</span>` : "";
    return `<button class="member" data-id="${m.key}" style="animation-delay:${Math.min(i, 24) * 14}ms">
      <div class="member-top">
        <div class="avatar" style="${avatarStyle(m)}">${esc(initials(m.name))}</div>
        <div class="member-name">
          <div class="xid">${idHtml(m, state.q)}</div>
          <h3 title="${esc(m.name)}">${highlight(m.name, state.q)}</h3>
        </div>
      </div>
      <div class="member-foot">${plateHtml(m, state.q)}${tag}</div>
    </button>`;
  }

  function rowHtml(m, i) {
    return `<tr data-id="${m.key}" tabindex="0">
      <td class="num">${i + 1}</td>
      <td><span class="xid">${idHtml(m, state.q)}</span></td>
      <td><div class="who"><div class="avatar" style="${avatarStyle(m)}">${esc(initials(m.name))}</div>${highlight(m.name, state.q)}</div></td>
      <td>${plateHtml(m, state.q)}</td>
      <td class="col-note muted">${esc(m.group === "gabungan" ? ["Chapter Gabungan", m.note].filter(Boolean).join(" · ") : m.note || "")}</td>
    </tr>`;
  }

  function render() {
    const list = filtered();
    const results = $("#results");
    $("#empty").hidden = list.length > 0;

    const groups = ["bogor", "gabungan"]
      .map((g) => ({ g, items: list.filter((m) => m.group === g) }))
      .filter((x) => x.items.length);

    let idx = 0;
    results.innerHTML = groups.map(({ g, items }) => {
      const head = groups.length > 1 || g === "gabungan"
        ? `<div class="group-head"><h2>${GROUPS[g]}</h2><span>${items.length} member</span></div>` : "";
      if (state.view === "list") {
        return head + `<div class="table-wrap"><table>
          <thead><tr><th class="num">#</th><th>X-ID</th><th>Nama</th><th>Plat Nomor</th><th class="col-note">Keterangan</th></tr></thead>
          <tbody>${items.map((m, i) => rowHtml(m, i)).join("")}</tbody></table></div>`;
      }
      return head + `<div class="grid">${items.map((m) => cardHtml(m, idx++)).join("")}</div>`;
    }).join("");

    const total = MEMBERS.length;
    $("#resultMeta").innerHTML = list.length === total
      ? `Menampilkan semua <b>${total}</b> member`
      : `Menampilkan <b>${list.length}</b> dari ${total} member`;

    syncUrl();
  }

  function renderChips() {
    const counts = {};
    MEMBERS.forEach((m) => { if (m.area) counts[m.area] = (counts[m.area] || 0) + 1; });
    const areas = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const majors = areas.filter((a) => counts[a] >= 3);
    const chips = [
      { key: "all", label: "Semua", n: MEMBERS.length },
      ...majors.map((a) => ({ key: "area:" + a, label: `Plat ${a}`, n: counts[a], title: AREAS[a] })),
      { key: "gabungan", label: "Chapter Gabungan", n: MEMBERS.filter((m) => m.group === "gabungan").length },
      ...areas.filter((a) => !majors.includes(a)).map((a) => ({ key: "area:" + a, label: `Plat ${a}`, n: counts[a], title: AREAS[a] })),
      { key: "none", label: "Tanpa Plat", n: MEMBERS.filter((m) => !m.plate).length },
    ];
    $("#chips").innerHTML = chips.map((c) =>
      `<button class="chip${state.filter === c.key ? " active" : ""}" data-filter="${c.key}" role="tab" aria-selected="${state.filter === c.key}" ${c.title ? `title="${esc(c.title)}"` : ""}>${esc(c.label)}<small>${c.n}</small></button>`
    ).join("");
  }

  function renderHero() {
    const bogor = MEMBERS.filter((m) => m.group === "bogor").length;
    const plateF = MEMBERS.filter((m) => m.area === "F").length;
    const regions = new Set(MEMBERS.map((m) => m.area).filter(Boolean)).size;
    const stats = [
      [MEMBERS.length, "Total member"],
      [bogor, "Member Bogor Raya"],
      [Math.round((plateF / MEMBERS.length) * 100) + "%", "Ber-plat F"],
      [regions, "Wilayah plat"],
    ];
    $("#heroStats").innerHTML = stats.map(([v, l]) => `<div class="hero-stat"><b data-count="${v}">${v}</b><span>${l}</span></div>`).join("");
    animateCounts();
  }

  function animateCounts() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $$("[data-count]").forEach((el) => {
      const raw = el.dataset.count;
      const target = parseInt(raw, 10);
      const suffix = raw.replace(/^\d+/, "");
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function renderStats() {
    const counts = {};
    MEMBERS.forEach((m) => { const k = m.area || "—"; counts[k] = (counts[k] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    $("#areaBars").innerHTML = rows.map(([k, v], i) => `
      <div class="bar-row">
        <div class="lbl"><b>${esc(k)}</b><span>${esc(k === "—" ? "Belum terdata" : AREAS[k] || "Lainnya")}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%;animation-delay:${i * 60}ms"></div></div>
        <div class="val">${v}</div>
      </div>`).join("");

    const buckets = {};
    MEMBERS.forEach((m) => { if (!m.id) return; const b =Math.floor(parseInt(m.id.slice(2), 10) / 1000); buckets[b] = (buckets[b] || 0) + 1; });
    const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    const bmax = Math.max(...Object.values(buckets));
    $("#idBars").innerHTML = keys.map((k, i) => `
      <div class="col">
        <div class="col-bar" data-v="${buckets[k]}" style="height:${(buckets[k] / bmax) * 85}%;animation-delay:${i * 70}ms"></div>
        <small>${k}xxx</small>
      </div>`).join("");

    $("#updated").textContent = `Data diperbarui ${new Date(window.XMOC_UPDATED || Date.now()).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} · ${MEMBERS.length} member`;
  }

  // ---------- detail ----------
  function openDetail(id) {
    const m = MEMBERS.find((x) => x.key === id);
    if (!m) return;
    const rows = [
      ["Nomor Member", m.id ? `<span class="xid">${m.id}</span>` : "Belum ada X-ID"],
      ["Chapter", m.group === "gabungan" ? `Chapter Gabungan${m.note ? " · " + esc(m.note) : ""}` : "Bogor Raya"],
      ["Wilayah Plat", m.area ? `${esc(m.area)} — ${esc(AREAS[m.area] || "Lainnya")}` : "Belum terdata"],
    ];
    if (m.note && m.group !== "gabungan") rows.push(["Keterangan", esc(m.note)]);
    $("#detailBody").innerHTML = `
      <div class="detail-head">
        <div class="avatar lg" style="${avatarStyle(m)}">${esc(initials(m.name))}</div>
        <h2>${esc(m.name)}</h2>
        ${plateHtml(m, "", "lg")}
      </div>
      <dl class="detail-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <div class="detail-actions">
        <button type="button" class="btn ghost" data-act="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Salin data</button>
        <button type="button" class="btn" data-act="share"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>Bagikan</button>
      </div>`;
    const text = `${m.id || ""} ${m.plate || ""} ${m.name}`.replace(/\s+/g, " ").trim() + " — XMOC Bogor Raya";
    $("#detailBody").onclick = async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "copy") {
        try { await navigator.clipboard.writeText(text); toast("Data member disalin"); } catch { toast("Gagal menyalin"); }
      } else if (act === "share") {
        const url = new URL(location.href);
        url.search = "?m=" + m.key;
        if (navigator.share) {
          navigator.share({ title: m.name, text, url: url.toString() }).catch(() => {});
        } else {
          window.open("https://wa.me/?text=" + encodeURIComponent(text + "\n" + url), "_blank", "noopener");
        }
      }
    };
    const dlg = $("#detail");
    if (!dlg.open) dlg.showModal();
  }

  // ---------- misc ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function exportCsv() {
    const list = filtered();
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [["No", "X-ID", "Nama", "Plat Nomor", "Chapter", "Keterangan"]]
      .concat(list.map((m, i) => [i + 1, m.id || "", m.name, m.plate || "", GROUPS[m.group], m.note || ""]))
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `member-xmoc-bogor-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${list.length} member diunduh`);
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.filter !== "all") p.set("f", state.filter);
    if (state.sort !== "id") p.set("s", state.sort);
    if (state.view !== "grid") p.set("v", state.view);
    const qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    state.filter = p.get("f") || "all";
    state.sort = ["id", "name", "plate"].includes(p.get("s")) ? p.get("s") : "id";
    if (p.has("v")) {
      state.view = p.get("v") === "list" ? "list" : "grid";
    } else {
      try { state.view = localStorage.getItem("xmoc-view") === "list" ? "list" : "grid"; } catch {}
    }
    return p.get("m");
  }

  function setView(v) {
    state.view = v;
    $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    try { localStorage.setItem("xmoc-view", v); } catch {}
    render();
  }

  // ---------- init ----------
  const deepLink = readUrl();
  $("#q").value = state.q;
  $("#sort").value = state.sort;
  $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));

  renderHero();
  renderChips();
  renderStats();
  render();
  if (deepLink) openDetail(deepLink.toUpperCase());

  let debounce;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 80);
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $$(".seg button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    state.filter = c.dataset.filter;
    renderChips();
    render();
  });
  $("#results").addEventListener("click", (e) => {
    const el = e.target.closest("[data-id]");
    if (el) openDetail(el.dataset.id);
  });
  $("#results").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("tr[data-id]")) openDetail(e.target.dataset.id);
  });
  $("#resetFilters").addEventListener("click", () => {
    state.q = ""; state.filter = "all"; $("#q").value = "";
    renderChips(); render(); $("#q").focus();
  });
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#detail").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#q") && !$("#detail").open) {
      e.preventDefault();
      $("#q").focus();
      $("#q").select();
    } else if (e.key === "Escape" && document.activeElement === $("#q") && $("#q").value) {
      $("#q").value = ""; state.q = ""; render();
    }
  });

  $("#themeToggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("xmoc-theme", next); } catch {}
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();

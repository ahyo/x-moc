// Parser daftar member. Dipakai di browser (panel admin) dan oleh scripts/*.mjs.
(function (root) {
  "use strict";

  const LINE = /^(?:(X-\d{4})\s+)?(?:([A-Z]{1,2})\s?(\d{1,4})(?:\s?([A-Z]{1,3}))?(?=\s))?\s*(.+?)\s*(?:\(([^)]+)\))?\s*$/;
  const PLATE = /^([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{0,3})$/;

  // Member tanpa X-ID tetap butuh kunci unik untuk link dan detail.
  const keyFor = (id, name) => id || "NOID-" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  function parseLine(line, group) {
    const m = line.replace(/\s+/g, " ").trim().match(LINE);
    if (!m) return null;
    const [, id, area, num, suffix, name, note] = m;
    return {
      key: keyFor(id, name),
      id: id || null,
      name,
      plate: area ? [area, num, suffix].filter(Boolean).join(" ") : null,
      area: area || null,
      note: note || null,
      group,
    };
  }

  // Menormalkan input plat bebas ("f1689rj", "F 1689 RJ") → { plate: "F 1689 RJ", area: "F" }.
  function parsePlate(text) {
    const t = (text || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (!t) return { plate: null, area: null };
    const m = t.match(PLATE);
    if (!m) return null;
    return { plate: [m[1], m[2], m[3]].filter(Boolean).join(" "), area: m[1] };
  }

  // Membaca pesan "UPDATE DATA MEMBER" dari WhatsApp: hanya baris bernomor yang dianggap data.
  function parseWhatsApp(text) {
    const members = [];
    const errors = [];
    const seen = new Set();
    let group = "bogor";
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
      if (!line) continue;
      if (/chapter gabungan/i.test(line)) { group = "gabungan"; continue; }
      const numbered = line.match(/^\d+\.?\s+(.+)$/);
      if (!numbered) continue;
      const m = parseLine(numbered[1], group);
      if (!m) { errors.push(line); continue; }
      if (seen.has(m.key)) { errors.push(`${line} (ID ganda)`); continue; }
      seen.add(m.key);
      members.push(m);
    }
    return { members, errors };
  }

  root.XMOC_PARSE = { parseLine, parsePlate, parseWhatsApp, keyFor };
})(typeof window !== "undefined" ? window : globalThis);

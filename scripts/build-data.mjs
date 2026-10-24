// Mengubah data/members.txt menjadi data/members.js (dimuat langsung oleh index.html).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const src = readFileSync(new URL("data/members.txt", root), "utf8");

const LINE = /^(?:(X-\d{4})\s+)?(?:([A-Z]{1,2})\s?(\d{1,4})(?:\s?([A-Z]{1,3}))?(?=\s))?\s*(.+?)\s*(?:\(([^)]+)\))?\s*$/;
const GROUPS = { "BOGOR RAYA": "bogor", "CHAPTER GABUNGAN": "gabungan" };

let group = "bogor";
const members = [];
const seen = new Set();

for (const raw of src.split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const header = line.match(/^\[(.+)\]$/);
  if (header) {
    group = GROUPS[header[1].toUpperCase()] ?? group;
    continue;
  }
  const m = line.match(LINE);
  if (!m) throw new Error(`Baris tidak dikenali: ${line}`);
  const [, id, area, num, suffix, name, note] = m;
  // Member tanpa X-ID tetap butuh kunci unik untuk link dan detail.
  const key = id ?? "NOID-" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (seen.has(key)) throw new Error(`ID ganda: ${key}`);
  seen.add(key);
  members.push({
    key,
    id: id ?? null,
    name,
    plate: area ? [area, num, suffix].filter(Boolean).join(" ") : null,
    area: area ?? null,
    note: note ?? null,
    group,
  });
}

const out = `// File ini dihasilkan oleh scripts/build-data.mjs — jangan diedit manual.\nwindow.XMOC_MEMBERS = ${JSON.stringify(members, null, 1)};\nwindow.XMOC_UPDATED = ${JSON.stringify(new Date().toISOString().slice(0, 10))};\n`;
writeFileSync(new URL("data/members.js", root), out);
console.log(`${members.length} member ditulis ke data/members.js (${members.filter((m) => m.group === "gabungan").length} chapter gabungan).`);

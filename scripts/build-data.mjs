// Mengubah data/members.txt menjadi:
// - data/members.js   → data cadangan yang dimuat langsung oleh situs
// - supabase/seed.sql → isi awal tabel members di Supabase
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import "../assets/parse.js";

const { parseLine } = globalThis.XMOC_PARSE;
const root = new URL("..", import.meta.url);
const src = readFileSync(new URL("data/members.txt", root), "utf8");

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
  const m = parseLine(line, group);
  if (!m) throw new Error(`Baris tidak dikenali: ${line}`);
  if (seen.has(m.key)) throw new Error(`ID ganda: ${m.key}`);
  seen.add(m.key);
  members.push(m);
}

const out = `// File ini dihasilkan oleh scripts/build-data.mjs — jangan diedit manual.\nwindow.XMOC_MEMBERS = ${JSON.stringify(members, null, 1)};\nwindow.XMOC_UPDATED = ${JSON.stringify(new Date().toISOString().slice(0, 10))};\n`;
writeFileSync(new URL("data/members.js", root), out);

// Seed hanya mengisi kolom data dasar, sehingga profil yang sudah diisi member tidak tertimpa.
const sql = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const rows = members.map((m) => `  (${[m.key, m.id, m.name, m.plate, m.area, m.note, m.group].map(sql).join(", ")})`);
const seed = `-- Dihasilkan oleh scripts/build-data.mjs — jalankan setelah schema.sql.
insert into public.members (key, x_id, name, plate, area, note, grp) values
${rows.join(",\n")}
on conflict (key) do update set
  x_id = excluded.x_id, name = excluded.name, plate = excluded.plate, area = excluded.area,
  note = excluded.note, grp = excluded.grp;
`;
mkdirSync(new URL("supabase/", root), { recursive: true });
writeFileSync(new URL("supabase/seed.sql", root), seed);

console.log(`${members.length} member ditulis ke data/members.js dan supabase/seed.sql (${members.filter((m) => m.group === "gabungan").length} chapter gabungan).`);

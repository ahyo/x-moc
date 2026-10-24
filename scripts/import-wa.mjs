// Mengimpor daftar member hasil copy dari WhatsApp ke data/members.txt.
// Pakai: node scripts/import-wa.mjs <file-teks-whatsapp>
// Lalu: node scripts/build-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Pakai: node scripts/import-wa.mjs <file-teks-whatsapp>");
  process.exit(1);
}

const HEADER = `# Data member XMOC Bogor Raya.
# Format per baris: [X-XXXX] [PLAT] Nama (catatan opsional) — X-ID dan plat boleh kosong
# Setelah mengubah file ini, jalankan: node scripts/build-data.mjs
`;

const out = [HEADER, "[BOGOR RAYA]"];
for (const raw of readFileSync(file, "utf8").split("\n")) {
  const line = raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!line) continue;
  if (/chapter gabungan/i.test(line)) {
    out.push("", "[CHAPTER GABUNGAN]");
    continue;
  }
  // Hanya baris bernomor ("12. X-0123 ...") yang dianggap data member; judul pesan diabaikan.
  const m = line.match(/^\d+\.?\s+(.+)$/);
  if (m) out.push(m[1]);
}

writeFileSync(new URL("../data/members.txt", import.meta.url), out.join("\n") + "\n");
console.log(`${out.filter((l) => l && !l.startsWith("#") && !l.startsWith("[")).length} baris member ditulis ke data/members.txt`);

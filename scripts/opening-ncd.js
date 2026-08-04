// Similarity graph over top chess openings using normalized compression
// distance, same method as the "see research" idea graph:
//   NCD(x,y) = (C(xy) - min(C(x),C(y))) / max(C(x),C(y))
// Here the "document" for each opening is its main line in SAN. Two openings
// whose move sequences share structure compress well together -> low distance.
// Edges keep each node's k nearest neighbours; clusters come from label
// propagation over those edges.
const { gzipSync } = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const K_NEAREST = 2;

// family = ground truth, used only for colouring / checking the clusters
const OPENINGS = [
  ["Italian Game",        "e4",  "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O"],
  ["Ruy Lopez",           "e4",  "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5"],
  ["Scotch Game",         "e4",  "1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Nf6 5.Nc3 Bb4 6.Nxc6 bxc6"],
  ["Petrov Defense",      "e4",  "1.e4 e5 2.Nf3 Nf6 3.Nxe5 d6 4.Nf3 Nxe4 5.d4 d5 6.Bd3 Nc6"],
  ["Four Knights",        "e4",  "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6 4.Bb5 Bb4 5.O-O O-O 6.d3 d6"],
  ["Vienna Game",         "e4",  "1.e4 e5 2.Nc3 Nf6 3.f4 d5 4.fxe5 Nxe4 5.Nf3 Be7 6.d4 O-O"],
  ["King's Gambit",       "e4",  "1.e4 e5 2.f4 exf4 3.Nf3 g5 4.h4 g4 5.Ne5 Nf6 6.d4 d6"],
  ["Sicilian Najdorf",    "sic", "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5"],
  ["Sicilian Dragon",     "sic", "1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6 6.Be3 Bg7"],
  ["Sicilian Sveshnikov", "sic", "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 e5 6.Ndb5 d6"],
  ["Accelerated Dragon",  "sic", "1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 g6 5.c4 Bg7 6.Be3 Nf6"],
  ["Sicilian Taimanov",   "sic", "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 Nc6 5.Nc3 Qc7 6.Be3 a6"],
  ["Sicilian Closed",     "sic", "1.e4 c5 2.Nc3 Nc6 3.g3 g6 4.Bg2 Bg7 5.d3 d6 6.f4 e6"],
  ["Sicilian Alapin",     "sic", "1.e4 c5 2.c3 d5 3.exd5 Qxd5 4.d4 Nf6 5.Nf3 e6 6.Be2 Nc6"],
  ["French Defense",      "e4",  "1.e4 e6 2.d4 d5 3.Nc3 Bb4 4.e5 c5 5.a3 Bxc3+ 6.bxc3 Ne7"],
  ["Caro-Kann",           "e4",  "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5 5.Ng3 Bg6 6.h4 h6"],
  ["Scandinavian",        "e4",  "1.e4 d5 2.exd5 Qxd5 3.Nc3 Qa5 4.d4 Nf6 5.Nf3 c6 6.Bc4 Bf5"],
  ["Pirc Defense",        "e4",  "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Nf3 Bg7 5.Be2 O-O 6.O-O c6"],
  ["Modern Defense",      "e4",  "1.e4 g6 2.d4 Bg7 3.Nc3 d6 4.f4 Nf6 5.Nf3 O-O 6.Bd3 Na6"],
  ["Alekhine Defense",    "e4",  "1.e4 Nf6 2.e5 Nd5 3.d4 d6 4.Nf3 Bg4 5.Be2 e6 6.O-O Be7"],
  ["Queen's Gambit Dec.", "d4",  "1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3 h6"],
  ["Slav Defense",        "d4",  "1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5 6.e3 e6"],
  ["Queen's Gambit Acc.", "d4",  "1.d4 d5 2.c4 dxc4 3.Nf3 Nf6 4.e3 e6 5.Bxc4 c5 6.O-O a6"],
  ["Nimzo-Indian",        "ind", "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O 5.Bd3 d5 6.Nf3 c5"],
  ["Queen's Indian",      "ind", "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.g3 Ba6 5.b3 Bb4+ 6.Bd2 Be7"],
  ["King's Indian",       "ind", "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5"],
  ["Gruenfeld Defense",   "ind", "1.d4 Nf6 2.c4 g6 3.Nc3 d5 4.cxd5 Nxd5 5.e4 Nxc3 6.bxc3 Bg7"],
  ["Benoni Defense",      "ind", "1.d4 Nf6 2.c4 c5 3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.e4 g6"],
  ["Dutch Defense",       "d4",  "1.d4 f5 2.g3 Nf6 3.Bg2 e6 4.Nf3 Be7 5.O-O O-O 6.c4 d6"],
  ["Catalan Opening",     "d4",  "1.d4 Nf6 2.c4 e6 3.g3 d5 4.Bg2 Be7 5.Nf3 O-O 6.O-O dxc4"],
  ["London System",       "d4",  "1.d4 Nf6 2.Nf3 e6 3.Bf4 c5 4.e3 b6 5.c3 Bb7 6.Nbd2 Be7"],
  ["English Opening",     "flk", "1.c4 e5 2.Nc3 Nf6 3.g3 d5 4.cxd5 Nxd5 5.Bg2 Nb6 6.Nf3 Nc6"],
  ["Reti Opening",        "flk", "1.Nf3 d5 2.c4 e6 3.g3 Nf6 4.Bg2 Be7 5.O-O O-O 6.b3 c5"],
];

const csize = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;

const names = OPENINGS.map((o) => o[0]);
const families = OPENINGS.map((o) => o[1]);
const texts = OPENINGS.map((o) => o[2]);
const single = texts.map(csize);

const edgesAll = [];
for (let a = 0; a < texts.length; a++) {
  for (let b = a + 1; b < texts.length; b++) {
    const joint = csize(texts[a] + "\n" + texts[b]);
    const ncd =
      (joint - Math.min(single[a], single[b])) / Math.max(single[a], single[b]);
    edgesAll.push({ a, b, ncd });
  }
}

// keep each node's K nearest neighbours (union, deduplicated)
const keep = new Set();
for (let n = 0; n < texts.length; n++) {
  edgesAll
    .filter((e) => e.a === n || e.b === n)
    .sort((x, y) => x.ncd - y.ncd)
    .slice(0, K_NEAREST)
    .forEach((e) => keep.add(`${e.a}-${e.b}`));
}
const edges = edgesAll.filter((e) => keep.has(`${e.a}-${e.b}`));

// label propagation: each node adopts the strongest label among its neighbours
const labels = names.map((_, i) => i);
for (let round = 0; round < 4; round++) {
  let changed = false;
  for (let n = 0; n < names.length; n++) {
    const votes = new Map();
    for (const e of edges) {
      if (e.a !== n && e.b !== n) continue;
      const other = e.a === n ? e.b : e.a;
      const w = 1 - e.ncd;
      votes.set(labels[other], (votes.get(labels[other]) ?? 0) + w);
    }
    if (votes.size === 0) continue;
    const best = [...votes.entries()].sort(
      (x, y) => y[1] - x[1] || x[0] - y[0]
    )[0][0];
    if (best !== labels[n]) {
      labels[n] = best;
      changed = true;
    }
  }
  if (!changed) break;
}

// name each cluster after the moves its members share most distinctively
const clusterIds = [...new Set(labels)];
const clusters = clusterIds.map((cid) => {
  const members = names.filter((_, i) => labels[i] === cid);
  return { id: cid, size: members.length, members };
});

const nodes = names.map((name, idx) => ({
  idx,
  name,
  family: families[idx],
  line: texts[idx],
  cluster: labels[idx],
}));

const out = { nodes, edges, edgesAll, clusters };
const dest = path.join(__dirname, "..", "data", "opening-ncd.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 1));

// console summary
const fam = {};
for (const c of clusters) {
  console.log(`\ncluster ${c.id} (${c.size}): ${c.members.join(", ")}`);
}
const sorted = [...edgesAll].sort((x, y) => x.ncd - y.ncd);
console.log("\nclosest pairs:");
for (const e of sorted.slice(0, 8))
  console.log(`  ${e.ncd.toFixed(3)}  ${names[e.a]} ~ ${names[e.b]}`);
console.log("most distant pairs:");
for (const e of sorted.slice(-5))
  console.log(`  ${e.ncd.toFixed(3)}  ${names[e.a]} ~ ${names[e.b]}`);
console.log(`\nwrote ${dest}`);

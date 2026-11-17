// Solmar Bay — gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library, no network
// request). This program hands it in: it copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps (reference/gate.json): game/ at most 993 files and
// directories together and 48 MiB in all, 3-4 screenshots of at most 256 KiB,
// the dossier at most 1.5 MiB with its text at most 163,840 bytes. Refuse early
// with a readable error instead of handing the grader a doomed /output.
// (Directories count toward the 993 too, so the count includes them.)
function countEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      files += 1;
      const sub = countEntries(p);
      files += sub.files;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

const gameStats = countEntries(join(here, 'game'));
if (gameStats.files > 993) throw new Error(`game/ holds ${gameStats.files} entries, over the 993 cap`);
if (gameStats.bytes > 48 * 1024 * 1024) throw new Error(`game/ holds ${gameStats.bytes} bytes, over the 48 MiB cap`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

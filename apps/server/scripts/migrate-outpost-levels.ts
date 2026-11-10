/**
 * One-off migration from the command line (the admin panel does the same on the server):
 * gives the outposts of a running game the level they would have if outpost levels had existed
 * from the start, replayed from the save backups (`src/game/outpostLevels.ts`).
 *
 * Usage (stop the server first — it overwrites the save every few seconds):
 *   npx tsx apps/server/scripts/migrate-outpost-levels.ts --save game.json backups/*.json
 *   … add --write to store the result (the old save is kept as game.json.bak-<time>).
 */
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { OUTPOST_MAX_LEVEL } from '@vectoria/shared';
import type { SavedGame } from '../src/game/GameState';
import {
  replayOutpostLevels,
  toOutpostBackup,
  type OutpostBackup,
} from '../src/game/outpostLevels';

function parseArgs(argv: string[]): { save: string; backups: string[]; write: boolean } {
  let save: string | undefined;
  const backups: string[] = [];
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--save') save = argv[++i];
    else if (arg === '--write') write = true;
    else backups.push(arg);
  }
  if (!save || backups.length === 0) {
    console.error('Usage: migrate-outpost-levels.ts --save <game.json> <backup.json…> [--write]');
    process.exit(1);
  }
  return { save, backups, write };
}

async function main(): Promise<void> {
  const { save: saveFile, backups: files, write } = parseArgs(process.argv.slice(2));
  const save = JSON.parse(await readFile(saveFile, 'utf8')) as SavedGame;
  if (save.version !== 2) throw new Error(`${saveFile}: save version ${save.version}, expected 2`);
  if (save.phase !== 'running') throw new Error(`${saveFile}: game is ${save.phase}, not running`);

  const backups: OutpostBackup[] = [];
  for (const file of files) {
    const backup = toOutpostBackup(file, JSON.parse(await readFile(file, 'utf8')));
    if (backup) backups.push(backup);
    else console.warn(`skip ${file}: not a v2 save`);
  }
  const result = replayOutpostLevels(save, backups);
  if (result.backups === 0) throw new Error('no usable backups');
  console.log(
    `${result.backups} backups (${result.skipped} skipped), gamedays ${result.fromGameday}–${result.toGameday}; save at gameday ${save.gameday}\n`,
  );

  const rows = result.rows.map((r) => [
    r.outpostId,
    r.ownerName,
    String(r.heldGamedays),
    `${r.sinceOldest && r.level < OUTPOST_MAX_LEVEL ? '≥' : ''}${r.level}`,
    r.level === r.currentLevel ? '' : `(war ${r.currentLevel})`,
  ]);
  const header = ['Stützpunkt', 'Besitzer', 'gehalten', 'Stufe', ''];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  for (const row of [header, ...rows]) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join('  '));
  }

  if (!write) {
    console.log('\nDry run — nothing written. Add --write to store it.');
    return;
  }
  for (const outpost of save.outposts) {
    const held = outpost.ownerId ? (result.held.get(outpost.id) ?? 0) : 0;
    if (held > 0) outpost.heldGamedays = held;
    else delete outpost.heldGamedays;
  }
  const backup = `${saveFile}.bak-${Date.now()}`;
  await copyFile(saveFile, backup);
  await writeFile(saveFile, JSON.stringify(save));
  console.log(`\nWritten to ${saveFile} (previous save kept as ${backup}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

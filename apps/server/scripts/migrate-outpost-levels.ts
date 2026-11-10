/**
 * One-off migration: gives the outposts of a running game the level (`Outpost.heldGamedays`)
 * they would have if outpost levels had existed from the start, by replaying the ownership seen
 * in the daily save backups (README "Backups") with the same rules the server uses
 * (`setOutpostOwner`): +1 held gameday per gameday start in the same hand, a conquest from another
 * player keeps the level minus 1, a ruin taken or an outpost given up starts at level 1.
 *
 * Granularity is one backup per day: an owner change is assumed to happen on the day of the first
 * backup that shows it, and a loss and re-take between two backups goes unseen. An outpost already
 * owned in the oldest backup counts from that backup's gameday (marked "≥").
 *
 * Usage (stop the server first — it overwrites the save every few seconds):
 *   npx tsx apps/server/scripts/migrate-outpost-levels.ts --save game.json backups/*.json
 *   … add --write to store the result (the old save is kept as game.json.bak-<time>).
 */
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { heldGamedaysForLevel, outpostLevel, OUTPOST_MAX_LEVEL } from '@vectoria/shared';
import type { SavedGame } from '../src/game/GameState';

interface Snapshot {
  file: string;
  gameday: number;
  owners: Map<string, string | null>;
}

interface Replay {
  owner: string | null;
  held: number;
  gameday: number;
  /** Owned since before the oldest backup: the real level may be higher. */
  open: boolean;
}

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

async function readSave(file: string): Promise<SavedGame> {
  const save = JSON.parse(await readFile(file, 'utf8')) as SavedGame;
  if (save.version !== 2) throw new Error(`${file}: save version ${save.version}, expected 2`);
  return save;
}

/** One ownership step from the last known state to `owner` seen at `gameday`. */
function step(state: Replay, owner: string | null, gameday: number): Replay {
  const starts = gameday - state.gameday;
  if (owner === state.owner) {
    return { ...state, held: owner ? state.held + starts : 0, gameday };
  }
  // Changed hands on `gameday`: the old owner held it through that day's start.
  const conquered = owner !== null && state.owner !== null;
  const level = outpostLevel(state.held + starts);
  return {
    owner,
    held: conquered ? heldGamedaysForLevel(level - 1) : 0,
    gameday,
    open: false,
  };
}

async function main(): Promise<void> {
  const { save: saveFile, backups, write } = parseArgs(process.argv.slice(2));
  const save = await readSave(saveFile);
  if (save.phase !== 'running') throw new Error(`${saveFile}: game is ${save.phase}, not running`);

  const snapshots: Snapshot[] = [];
  for (const file of backups) {
    const backup = await readSave(file);
    // Only backups of this round: same map seed, already running, not from the future.
    if (backup.seed !== save.seed || backup.phase === 'registration') {
      console.warn(`skip ${file}: other round`);
      continue;
    }
    if (backup.gameday > save.gameday) {
      console.warn(`skip ${file}: gameday ${backup.gameday} is after the save`);
      continue;
    }
    snapshots.push({
      file,
      gameday: backup.gameday,
      owners: new Map(backup.outposts.map((o) => [o.id, o.ownerId])),
    });
  }
  snapshots.sort((a, b) => a.gameday - b.gameday || a.file.localeCompare(b.file));
  if (snapshots.length === 0) throw new Error('no usable backups');
  console.log(
    `${snapshots.length} backups, gamedays ${snapshots[0]!.gameday}–${snapshots.at(-1)!.gameday}; save at gameday ${save.gameday}\n`,
  );

  const names = new Map(save.players.map((p) => [p.id, p.name]));
  const rows: string[][] = [];
  for (const outpost of save.outposts) {
    let state: Replay | null = null;
    for (const snap of snapshots) {
      if (!snap.owners.has(outpost.id)) continue; // placed later by the admin
      const owner = snap.owners.get(outpost.id) ?? null;
      state = state
        ? step(state, owner, snap.gameday)
        : { owner, held: 0, gameday: snap.gameday, open: owner !== null };
    }
    state = state
      ? step(state, outpost.ownerId, save.gameday)
      : { owner: outpost.ownerId, held: 0, gameday: save.gameday, open: false };

    const before = outpostLevel(outpost.heldGamedays ?? 0);
    const held = outpost.ownerId ? state.held : 0;
    if (held > 0) outpost.heldGamedays = held;
    else delete outpost.heldGamedays;
    const level = outpostLevel(held);
    rows.push([
      outpost.id,
      outpost.ownerId ? (names.get(outpost.ownerId) ?? outpost.ownerId) : 'Ruine',
      String(held),
      `${state.open && level < OUTPOST_MAX_LEVEL ? '≥' : ''}${level}`,
      level === before ? '' : `(war ${before})`,
    ]);
  }

  const header = ['Stützpunkt', 'Besitzer', 'gehalten', 'Stufe', ''];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  for (const row of [header, ...rows]) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join('  '));
  }

  if (!write) {
    console.log('\nDry run — nothing written. Add --write to store it.');
    return;
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

/**
 * Outpost levels for a game that was already running when levels came in: replays the ownership
 * seen in the save backups (README "Backups", `deploy.sh`) with the server's rules
 * (`GameState.setOutpostOwner`): +1 held gameday per gameday start in the same hand, a conquest
 * from another player keeps the level minus 1, a ruin taken or an outpost given up starts at 1.
 *
 * Granularity is one backup per day: an owner change counts from the first backup that shows it,
 * and a loss and re-take between two backups goes unseen. An outpost already owned in the oldest
 * backup counts from that backup's gameday (`sinceOldest`). Used by the admin panel
 * (`GET /api/admin/outpost-levels`, action `applyOutpostLevels`) and `scripts/migrate-outpost-levels.ts`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { heldGamedaysForLevel, outpostLevel, type OutpostLevelPreview } from '@vectoria/shared';
import type { SavedGame } from './GameState';

/** What a backup contributes: its round, gameday and who owned which outpost. */
export interface OutpostBackup {
  name: string;
  seed: number;
  phase: SavedGame['phase'];
  gameday: number;
  owners: Map<string, string | null>;
}

interface Replay {
  owner: string | null;
  held: number;
  gameday: number;
  sinceOldest: boolean;
}

/** Slims a parsed save down to what the replay needs; null for anything that is not a v2 save. */
export function toOutpostBackup(name: string, value: unknown): OutpostBackup | null {
  const save = value as Partial<SavedGame> | null;
  if (!save || save.version !== 2 || !Array.isArray(save.outposts)) return null;
  if (typeof save.gameday !== 'number' || typeof save.seed !== 'number') return null;
  return {
    name,
    seed: save.seed,
    phase: save.phase!,
    gameday: save.gameday,
    owners: new Map(save.outposts.map((o) => [o.id, o.ownerId])),
  };
}

/** Reads every `*.json` save in `dir` (unreadable or foreign files are skipped). */
export async function loadOutpostBackups(dir: string): Promise<OutpostBackup[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const backups: OutpostBackup[] = [];
  for (const name of names) {
    try {
      const backup = toOutpostBackup(name, JSON.parse(await readFile(join(dir, name), 'utf8')));
      if (backup) backups.push(backup);
    } catch {
      // A torn or foreign file: not a backup of ours.
    }
  }
  return backups;
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
    sinceOldest: false,
  };
}

/**
 * Replays `backups` up to the running game `current`. Backups of another round (other seed), not
 * yet running, or from after `current` are skipped. `held` maps every outpost to the
 * `heldGamedays` it should have now.
 */
export function replayOutpostLevels(
  current: Pick<SavedGame, 'seed' | 'gameday' | 'outposts' | 'players'>,
  backups: OutpostBackup[],
): OutpostLevelPreview & { held: Map<string, number> } {
  const usable = backups
    .filter((b) => b.seed === current.seed && b.phase !== 'registration')
    .filter((b) => b.gameday <= current.gameday)
    .sort((a, b) => a.gameday - b.gameday || a.name.localeCompare(b.name));
  const names = new Map(current.players.map((p) => [p.id, p.name]));
  const held = new Map<string, number>();
  const rows: OutpostLevelPreview['rows'] = [];
  for (const outpost of current.outposts) {
    let state: Replay | null = null;
    for (const backup of usable) {
      if (!backup.owners.has(outpost.id)) continue; // placed later by the admin
      const owner = backup.owners.get(outpost.id) ?? null;
      state = state
        ? step(state, owner, backup.gameday)
        : { owner, held: 0, gameday: backup.gameday, sinceOldest: owner !== null };
    }
    state = state
      ? step(state, outpost.ownerId, current.gameday)
      : { owner: outpost.ownerId, held: 0, gameday: current.gameday, sinceOldest: false };
    const heldGamedays = outpost.ownerId ? state.held : 0;
    held.set(outpost.id, heldGamedays);
    if (!outpost.ownerId) continue;
    rows.push({
      outpostId: outpost.id,
      ownerName: names.get(outpost.ownerId) ?? outpost.ownerId,
      heldGamedays,
      level: outpostLevel(heldGamedays),
      currentLevel: outpostLevel(outpost.heldGamedays ?? 0),
      sinceOldest: state.sinceOldest,
    });
  }
  return {
    backups: usable.length,
    skipped: backups.length - usable.length,
    fromGameday: usable[0]?.gameday ?? null,
    toGameday: usable.at(-1)?.gameday ?? null,
    rows,
    held,
  };
}

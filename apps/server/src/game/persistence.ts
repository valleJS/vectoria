import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { log } from '../logger';
import type { GameState, SavedGame } from './GameState';

const SAVE_INTERVAL_MS = 5_000;

/**
 * Saves the game as one JSON file (write-to-temp then rename, so a crash never leaves a torn
 * file). Enough for a prototype with dozens of players; move to Postgres when that stops holding.
 */
export class Persistence {
  private readonly file: string;
  private timer: NodeJS.Timeout | undefined;
  private saving: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  async load(): Promise<SavedGame | undefined> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as SavedGame;
      if (saved.version !== 1) throw new Error(`Unsupported save version ${String(saved.version)}`);
      log.info(
        `Loaded game from ${this.file} (phase ${saved.phase}, ${saved.players.length} players)`,
      );
      return saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  start(state: GameState): void {
    this.timer = setInterval(() => void this.save(state), SAVE_INTERVAL_MS);
  }

  async stop(state: GameState): Promise<void> {
    clearInterval(this.timer);
    state.dirty = true;
    await this.save(state);
  }

  save(state: GameState): Promise<void> {
    if (!state.dirty) return this.saving;
    state.dirty = false;
    const json = JSON.stringify(state.toJSON());
    this.saving = this.saving
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(`${this.file}.tmp`, json);
        await rename(`${this.file}.tmp`, this.file);
      })
      .catch((error: unknown) => {
        state.dirty = true;
        log.error('Saving game failed', error);
      });
    return this.saving;
  }
}

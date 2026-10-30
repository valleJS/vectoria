import { randomBytes, randomUUID } from 'node:crypto';
import {
  canAfford,
  CARD_TYPES,
  CARDS,
  DAILY_ACTIVITY_INCOME,
  DAILY_BASE_INCOME,
  emptyResources,
  FORTIFY_DURATION_MS,
  FORTIFY_MULTIPLIER,
  GAMEDAY_MS,
  GATHER_PER_100_TROOPS_PER_DAY,
  HOUR_MS,
  PLUNDER_SHARE,
  RESOURCE_NAMES,
  RESOURCES,
  STARTING_RESOURCES,
  STARTING_TROOPS,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  travelMs,
  VICTORY_POINT_COST,
  type AdminState,
  type ArmyStatus,
  type ArmyTarget,
  type ArmyView,
  type CardType,
  type Chest,
  type GamePhase,
  type GameView,
  type LogEntry,
  type MapData,
  type ResourceSpot,
  type Resources,
  type ResourceType,
  type Vec2,
} from '@vectoria/shared';
import { dayKey, gameTimeBetween, isGameTime, WEEKDAY_SCHEDULE, type Schedule } from './calendar';
import { generateMap } from './mapgen';
import { createWorld, farthestFrom, landTiles } from './world';

const MAX_LOG = 30;
const MAX_NAME_LENGTH = 24;

interface PlayerRecord {
  id: string;
  name: string;
  token: string;
  castle: Vec2 | null;
  resources: Resources;
  /** Fractional gathering progress, flushed into `resources` in whole units. */
  gathered: Resources;
  victoryPoints: number;
  homeTroops: number;
  activity: ResourceType | null;
  pendingActivity: ResourceType | null;
  cards: CardType[];
  fortifiedUntil: number | null;
  log: LogEntry[];
}

interface ArmyRecord {
  id: string;
  ownerId: string;
  troops: number;
  status: ArmyStatus;
  from: Vec2;
  to: Vec2;
  target: ArmyTarget;
  departClock: number;
  arriveClock: number;
  fog: boolean;
  stealth: boolean;
  forcedMarch: boolean;
  /** Plunder carried home. */
  loot: Resources;
}

/** Everything needed to restore a game; written to disk by `Persistence`. */
export interface SavedGame {
  version: 1;
  savedAt: number;
  phase: GamePhase;
  seed: number;
  mapSize: number | null;
  clock: number;
  paused: boolean;
  gameday: number;
  lastDayKey: string | null;
  winnerId: string | null;
  nextId: number;
  players: PlayerRecord[];
  armies: ArmyRecord[];
  spots: ResourceSpot[];
  chests: Chest[];
}

export interface GameOptions {
  seed: number;
  hours: 'weekdays' | 'always';
  timezone: string;
  timeScale: number;
  victoryPointsToWin: number;
}

/** Thrown for player commands that are well-formed but not allowed; the message is shown. */
export class RuleError extends Error {}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * Authoritative game state. Mutated only by `update` and validated commands; every mutation sets
 * `dirty` so the persistence layer knows to save.
 */
export class GameState {
  tick = 0;
  dirty = false;
  map: MapData | null = null;

  private readonly options: GameOptions;
  private readonly schedule: Schedule;
  private data: SavedGame;
  private running = false;
  private readonly online = new Map<string, number>();

  constructor(options: GameOptions, saved?: SavedGame) {
    this.options = options;
    this.schedule = { ...WEEKDAY_SCHEDULE, timezone: options.timezone };
    this.data = saved ?? this.emptyGame(options.seed, []);
    if (this.data.mapSize !== null) {
      this.map = generateMap(this.data.mapSize, this.data.mapSize, this.data.seed);
    }
    if (saved && saved.phase === 'running' && !saved.paused) this.catchUp(saved.savedAt);
  }

  get phase(): GamePhase {
    return this.data.phase;
  }

  toJSON(): SavedGame {
    return { ...this.data, savedAt: Date.now() };
  }

  // ---- Registration & sessions ----

  register(rawName: string): { token: string; playerId: string } {
    if (this.data.phase !== 'registration') {
      throw new RuleError('Die Anmeldung ist geschlossen.');
    }
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      throw new RuleError(`Name muss 2–${MAX_NAME_LENGTH} Zeichen lang sein.`);
    }
    if (this.data.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new RuleError('Dieser Name ist schon vergeben.');
    }
    const player = this.newPlayer(name);
    this.data.players.push(player);
    this.dirty = true;
    return { token: player.token, playerId: player.id };
  }

  playerIdForToken(token: string): string | null {
    return this.data.players.find((p) => p.token === token)?.id ?? null;
  }

  setOnline(playerId: string, online: boolean): void {
    const count = (this.online.get(playerId) ?? 0) + (online ? 1 : -1);
    if (count > 0) this.online.set(playerId, count);
    else this.online.delete(playerId);
  }

  lobby(): { phase: GamePhase; players: string[] } {
    return { phase: this.data.phase, players: this.data.players.map((p) => p.name) };
  }

  // ---- Player commands ----

  setActivity(playerId: string, resource: ResourceType): void {
    const player = this.requirePlaying(playerId);
    player.pendingActivity = resource;
    this.dirty = true;
  }

  buy(playerId: string, item: 'troops' | 'victoryPoint', count: number): void {
    const player = this.requirePlaying(playerId);
    const cost = item === 'troops' ? TROOP_BATCH_COST : VICTORY_POINT_COST;
    if (!canAfford(player.resources, cost, count)) throw new RuleError('Nicht genug Ressourcen.');
    for (const r of RESOURCES) player.resources[r] -= cost[r] * count;
    if (item === 'troops') {
      player.homeTroops += count * TROOP_BATCH_SIZE;
    } else {
      player.victoryPoints += count;
      this.addLog(player, `Du hast ${count} Siegpunkt(e) gekauft.`);
      if (player.victoryPoints >= this.options.victoryPointsToWin) this.finish(player.id);
    }
    this.dirty = true;
  }

  sendArmy(playerId: string, troops: number, target: ArmyTarget, cards: CardType[]): void {
    const player = this.requirePlaying(playerId);
    if (troops > player.homeTroops) throw new RuleError('So viele Truppen hast du nicht zu Hause.');
    for (const card of cards) {
      if (CARDS[card].use !== 'march')
        throw new RuleError(`${CARDS[card].name} ist keine Marschkarte.`);
      if (!player.cards.includes(card))
        throw new RuleError(`Du hast keine ${CARDS[card].name}-Karte.`);
    }
    const to = this.targetPosition(target);
    if (!to) throw new RuleError('Ziel existiert nicht.');
    if (target.kind === 'castle' && target.id === playerId) {
      throw new RuleError('Du kannst deine eigene Burg nicht angreifen.');
    }

    for (const card of cards) player.cards.splice(player.cards.indexOf(card), 1);
    player.homeTroops -= troops;
    const forcedMarch = cards.includes('forcedMarch');
    const from = player.castle!;
    this.data.armies.push({
      id: this.nextId('army'),
      ownerId: playerId,
      troops,
      status: 'outbound',
      from,
      to,
      target,
      departClock: this.data.clock,
      arriveClock: this.data.clock + travelMs(distance(from, to), this.map!.width, forcedMarch),
      fog: cards.includes('fog'),
      stealth: cards.includes('stealth'),
      forcedMarch,
      loot: emptyResources(),
    });
    this.dirty = true;
  }

  recallArmy(playerId: string, armyId: string): void {
    this.requirePlaying(playerId);
    const army = this.data.armies.find((a) => a.id === armyId && a.ownerId === playerId);
    if (!army) throw new RuleError('Unbekannter Truppenzug.');
    if (army.status === 'returning') throw new RuleError('Der Zug ist bereits auf dem Rückweg.');
    this.startReturn(army, this.armyPosition(army));
    this.dirty = true;
  }

  playCard(playerId: string, card: CardType): void {
    const player = this.requirePlaying(playerId);
    if (CARDS[card].use !== 'instant') {
      throw new RuleError(`${CARDS[card].name} wird beim Losschicken eines Zuges gespielt.`);
    }
    const index = player.cards.indexOf(card);
    if (index < 0) throw new RuleError(`Du hast keine ${CARDS[card].name}-Karte.`);
    player.cards.splice(index, 1);
    // card === 'fortify' is the only instant card.
    player.fortifiedUntil =
      Math.max(player.fortifiedUntil ?? 0, this.data.clock) + FORTIFY_DURATION_MS;
    this.addLog(player, 'Bollwerk aktiv: deine Burg verteidigt mit +50 %.');
    this.dirty = true;
  }

  // ---- Simulation ----

  /** Advances by one tick of real time. */
  update(realDtMs: number, now = Date.now()): void {
    this.tick++;
    if (this.data.phase !== 'running') {
      this.running = false;
      return;
    }
    const inHours = this.options.hours === 'always' || isGameTime(this.schedule, new Date(now));
    this.running = inHours && !this.data.paused;
    if (this.running) this.advance(realDtMs * this.options.timeScale);

    if (!this.data.paused) {
      const key =
        this.options.hours === 'always'
          ? `clock-${Math.floor(this.data.clock / GAMEDAY_MS)}`
          : inHours
            ? dayKey(this.schedule, new Date(now))
            : null;
      if (key !== null && key !== this.data.lastDayKey) {
        this.data.lastDayKey = key;
        this.startGameday();
      }
    }
  }

  /** Moves the game clock forward, resolving gathering and every arrival in order. */
  private advance(dClock: number): void {
    const end = this.data.clock + dClock;
    this.gather(dClock);
    for (;;) {
      const next = this.data.armies
        .filter((a) => a.status !== 'stationed' && a.arriveClock <= end)
        .sort((a, b) => a.arriveClock - b.arriveClock)[0];
      if (!next || this.data.phase !== 'running') break;
      this.data.clock = Math.max(this.data.clock, next.arriveClock);
      this.arrive(next);
    }
    this.data.clock = end;
    this.dirty = true;
  }

  private gather(dClock: number): void {
    for (const army of this.data.armies) {
      if (army.status !== 'stationed' || army.target.kind !== 'spot') continue;
      const spot = this.data.spots.find((s) => s.id === army.target.id);
      const owner = this.player(army.ownerId);
      if (!spot || !owner) continue;
      owner.gathered[spot.resource] +=
        (army.troops / 100) * GATHER_PER_100_TROOPS_PER_DAY * (dClock / GAMEDAY_MS);
      const whole = Math.floor(owner.gathered[spot.resource]);
      owner.gathered[spot.resource] -= whole;
      owner.resources[spot.resource] += whole;
    }
  }

  private arrive(army: ArmyRecord): void {
    const owner = this.player(army.ownerId);
    if (!owner) {
      this.removeArmy(army);
      return;
    }
    if (army.status === 'returning') {
      owner.homeTroops += army.troops;
      for (const r of RESOURCES) owner.resources[r] += army.loot[r];
      if (RESOURCES.some((r) => army.loot[r] > 0)) {
        this.addLog(owner, `Deine Truppen bringen Beute heim: ${formatResources(army.loot)}.`);
      }
      this.removeArmy(army);
      return;
    }

    switch (army.target.kind) {
      case 'spot':
        army.status = 'stationed';
        army.from = army.to;
        return;
      case 'chest': {
        const index = this.data.chests.findIndex((c) => c.id === army.target.id);
        if (index >= 0) {
          this.data.chests.splice(index, 1);
          const card = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)]!;
          owner.cards.push(card);
          this.addLog(owner, `Truhe geöffnet: Karte „${CARDS[card].name}“ erhalten.`);
        } else {
          this.addLog(owner, 'Die Truhe war schon leer.');
        }
        this.startReturn(army, army.to);
        return;
      }
      case 'castle':
        this.battle(army, owner);
        return;
    }
  }

  private battle(army: ArmyRecord, attacker: PlayerRecord): void {
    const defender = this.player(army.target.id);
    if (!defender) {
      this.startReturn(army, army.to);
      return;
    }
    const fortified = (defender.fortifiedUntil ?? 0) > this.data.clock;
    const multiplier = fortified ? FORTIFY_MULTIPLIER : 1;
    const defense = defender.homeTroops * multiplier;

    if (army.troops > defense) {
      const lost = Math.round(defense);
      const plunder = emptyResources();
      for (const r of RESOURCES) {
        plunder[r] = Math.floor(defender.resources[r] * PLUNDER_SHARE);
        defender.resources[r] -= plunder[r];
      }
      const defenderLost = defender.homeTroops;
      defender.homeTroops = 0;
      army.troops = Math.max(1, army.troops - lost);
      army.loot = plunder;
      this.addLog(
        attacker,
        `Sieg gegen ${defender.name}! ${lost} Verluste, Beute: ${formatResources(plunder)}.`,
      );
      this.addLog(
        defender,
        `${attacker.name} hat deine Burg erobert. ${defenderLost} Verteidiger gefallen, ` +
          `geplündert: ${formatResources(plunder)}.`,
      );
      this.startReturn(army, army.to);
    } else {
      const lost = Math.min(defender.homeTroops, Math.ceil(army.troops / multiplier));
      defender.homeTroops -= lost;
      this.addLog(
        attacker,
        `Angriff auf ${defender.name} gescheitert: ${army.troops} Truppen verloren.`,
      );
      this.addLog(
        defender,
        `Angriff von ${attacker.name} (${army.troops} Truppen) abgewehrt. ${lost} Verluste` +
          `${fortified ? ' (Bollwerk aktiv)' : ''}.`,
      );
      this.removeArmy(army);
    }
  }

  private startGameday(): void {
    this.data.gameday++;
    for (const player of this.data.players) {
      player.activity = player.pendingActivity ?? player.activity;
      const income = emptyResources();
      for (const r of RESOURCES) {
        income[r] = r === player.activity ? DAILY_ACTIVITY_INCOME : DAILY_BASE_INCOME;
        player.resources[r] += income[r];
      }
      this.addLog(player, `Gameday ${this.data.gameday} beginnt: +${formatResources(income)}.`);
    }
    const chestCap = this.data.players.length;
    const toSpawn = Math.ceil(this.data.players.length / 3);
    for (let i = 0; i < toSpawn && this.data.chests.length < chestCap; i++) this.spawnChest();
    this.dirty = true;
  }

  /** Clock catch-up for the time the server was down. */
  private catchUp(savedAt: number): void {
    const now = Date.now();
    const elapsed =
      this.options.hours === 'always'
        ? now - savedAt
        : gameTimeBetween(this.schedule, savedAt, now);
    if (elapsed > 0) this.advance(elapsed * this.options.timeScale);
  }

  // ---- Admin ----

  start(): void {
    if (this.data.phase !== 'registration') throw new RuleError('Spiel läuft bereits.');
    const players = this.data.players;
    if (players.length === 0) throw new RuleError('Niemand ist angemeldet.');
    const world = createWorld(players.length, this.data.seed);
    this.map = world.map;
    this.data.mapSize = world.map.width;
    this.data.spots = world.spots;
    players.forEach((player, i) => {
      player.castle = world.castles[i]!;
      player.homeTroops = STARTING_TROOPS;
      player.resources = { ...STARTING_RESOURCES };
    });
    this.data.phase = 'running';
    for (let i = 0; i < Math.ceil(players.length / 2); i++) this.spawnChest();
    this.dirty = true;
  }

  end(): void {
    if (this.data.phase !== 'running') throw new RuleError('Es läuft kein Spiel.');
    const leader = [...this.data.players].sort((a, b) => b.victoryPoints - a.victoryPoints)[0];
    this.finish(leader?.id ?? null);
  }

  /** Back to registration with the same players and a fresh map seed. */
  reset(seed: number): void {
    const players = this.data.players.map((p) => ({
      ...this.newPlayer(p.name),
      id: p.id,
      token: p.token,
    }));
    this.data = this.emptyGame(seed, players);
    this.map = null;
    this.dirty = true;
  }

  setPaused(paused: boolean): void {
    this.data.paused = paused;
    this.dirty = true;
  }

  advanceClock(hours: number): void {
    if (this.data.phase !== 'running') throw new RuleError('Es läuft kein Spiel.');
    this.advance(hours * HOUR_MS);
  }

  forceGameday(): void {
    if (this.data.phase !== 'running') throw new RuleError('Es läuft kein Spiel.');
    this.startGameday();
  }

  spawnChest(): void {
    if (!this.map) throw new RuleError('Noch keine Karte.');
    const taken = [
      ...this.data.players.flatMap((p) => (p.castle ? [p.castle] : [])),
      ...this.data.spots.map((s) => s.position),
      ...this.data.chests.map((c) => c.position),
    ];
    this.data.chests.push({
      id: this.nextId('chest'),
      position: farthestFrom(landTiles(this.map), taken, Math.random),
    });
    this.dirty = true;
  }

  kick(playerId: string): void {
    this.data.players = this.data.players.filter((p) => p.id !== playerId);
    this.data.armies = this.data.armies.filter((a) => a.ownerId !== playerId);
    this.dirty = true;
  }

  grant(playerId: string, resource: ResourceType, amount: number): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    player.resources[resource] = Math.max(0, player.resources[resource] + amount);
    this.dirty = true;
  }

  // ---- Views ----

  viewFor(playerId: string): GameView | null {
    const self = this.player(playerId);
    if (!self) return null;
    const clock = this.data.clock;
    return {
      phase: this.data.phase,
      clock: this.clockState(),
      victoryPointsToWin: this.options.victoryPointsToWin,
      winnerId: this.data.winnerId,
      players: this.data.players.map((p) => ({
        id: p.id,
        name: p.name,
        castle: p.castle,
        victoryPoints: p.victoryPoints,
        homeTroops: p.homeTroops,
        fortified: (p.fortifiedUntil ?? 0) > clock,
        online: this.online.has(p.id),
      })),
      spots: this.data.spots,
      chests: this.data.chests,
      armies: this.data.armies.map((a) => this.armyView(a, playerId)),
      self: {
        id: self.id,
        name: self.name,
        resources: self.resources,
        activity: self.activity,
        pendingActivity: self.pendingActivity,
        cards: self.cards,
        fortifiedUntil: self.fortifiedUntil,
        log: self.log,
      },
    };
  }

  adminState(): AdminState {
    return {
      phase: this.data.phase,
      clock: this.clockState(),
      mapSize: this.data.mapSize,
      winnerId: this.data.winnerId,
      victoryPointsToWin: this.options.victoryPointsToWin,
      players: this.data.players.map((p) => ({
        id: p.id,
        name: p.name,
        online: this.online.has(p.id),
        victoryPoints: p.victoryPoints,
        homeTroops: p.homeTroops,
        troopsAway: this.data.armies
          .filter((a) => a.ownerId === p.id)
          .reduce((sum, a) => sum + a.troops, 0),
        resources: p.resources,
        cards: p.cards,
        pendingActivity: p.pendingActivity,
      })),
      armies: this.data.armies.length,
      chests: this.data.chests.length,
    };
  }

  private clockState(): GameView['clock'] {
    return {
      clock: this.data.clock,
      running: this.running,
      paused: this.data.paused,
      timeScale: this.options.timeScale,
      gameday: this.data.gameday,
      mode: this.options.hours,
    };
  }

  private armyView(army: ArmyRecord, viewerId: string): ArmyView {
    const own = army.ownerId === viewerId;
    const moving = army.status !== 'stationed';
    return {
      id: army.id,
      ownerId: army.ownerId,
      status: army.status,
      troops: own || !army.fog ? army.troops : null,
      position: this.armyPosition(army),
      from: army.from,
      to: own || !army.stealth ? army.to : null,
      target: own || !army.stealth ? army.target : null,
      departClock: moving ? army.departClock : null,
      arriveClock: moving ? army.arriveClock : null,
      fog: army.fog,
      stealth: army.stealth,
      forcedMarch: army.forcedMarch,
    };
  }

  // ---- Helpers ----

  private emptyGame(seed: number, players: PlayerRecord[]): SavedGame {
    return {
      version: 1,
      savedAt: Date.now(),
      phase: 'registration',
      seed,
      mapSize: null,
      clock: 0,
      paused: false,
      gameday: 0,
      lastDayKey: null,
      winnerId: null,
      nextId: 1,
      players,
      armies: [],
      spots: [],
      chests: [],
    };
  }

  private newPlayer(name: string): PlayerRecord {
    return {
      id: randomUUID(),
      name,
      token: randomBytes(24).toString('base64url'),
      castle: null,
      resources: emptyResources(),
      gathered: emptyResources(),
      victoryPoints: 0,
      homeTroops: 0,
      activity: null,
      pendingActivity: null,
      cards: [],
      fortifiedUntil: null,
      log: [],
    };
  }

  private finish(winnerId: string | null): void {
    this.data.phase = 'ended';
    this.data.winnerId = winnerId;
    const winner = winnerId ? this.player(winnerId) : undefined;
    for (const player of this.data.players) {
      this.addLog(player, winner ? `Spielende — ${winner.name} gewinnt!` : 'Spielende.');
    }
    this.dirty = true;
  }

  private player(id: string): PlayerRecord | undefined {
    return this.data.players.find((p) => p.id === id);
  }

  private requirePlaying(playerId: string): PlayerRecord {
    if (this.data.phase !== 'running') throw new RuleError('Das Spiel läuft gerade nicht.');
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    return player;
  }

  private targetPosition(target: ArmyTarget): Vec2 | null {
    switch (target.kind) {
      case 'castle':
        return this.player(target.id)?.castle ?? null;
      case 'spot':
        return this.data.spots.find((s) => s.id === target.id)?.position ?? null;
      case 'chest':
        return this.data.chests.find((c) => c.id === target.id)?.position ?? null;
    }
  }

  private armyPosition(army: ArmyRecord): Vec2 {
    if (army.status === 'stationed') return army.to;
    const span = army.arriveClock - army.departClock;
    const t = span > 0 ? (this.data.clock - army.departClock) / span : 1;
    return lerp(army.from, army.to, Math.min(1, Math.max(0, t)));
  }

  private startReturn(army: ArmyRecord, from: Vec2): void {
    const owner = this.player(army.ownerId);
    if (!owner?.castle) {
      this.removeArmy(army);
      return;
    }
    army.status = 'returning';
    army.from = from;
    army.to = owner.castle;
    army.target = { kind: 'castle', id: owner.id };
    army.departClock = this.data.clock;
    army.arriveClock = this.data.clock + travelMs(distance(from, owner.castle), this.map!.width);
  }

  private removeArmy(army: ArmyRecord): void {
    this.data.armies = this.data.armies.filter((a) => a !== army);
  }

  private nextId(prefix: string): string {
    return `${prefix}-${this.data.nextId++}`;
  }

  private addLog(player: PlayerRecord, text: string): void {
    player.log.unshift({ at: Date.now(), text });
    if (player.log.length > MAX_LOG) player.log.length = MAX_LOG;
  }
}

function formatResources(resources: Resources): string {
  const parts = RESOURCES.filter((r) => resources[r] > 0).map(
    (r) => `${resources[r]} ${RESOURCE_NAMES[r]}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'nichts';
}

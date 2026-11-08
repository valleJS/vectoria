import { randomBytes, randomUUID } from 'node:crypto';
import {
  BAREFOOT_DURATION_MS,
  BAREFOOT_SPEED,
  battleLosses,
  canAfford,
  CARDS,
  CASTLE_PLUNDER_SHARE,
  CHESTS_PER_GAMEDAY,
  LOADED_SPEED,
  maxChestsOnMap,
  CONVOY_PLUNDER_SHARE,
  DAILY_ACTIVITY_INCOME,
  DAILY_BASE_INCOME,
  OUTPOST_DAILY_INCOME,
  drawCard,
  emptyResources,
  findPath,
  FORTIFY_DURATION_MS,
  FORTIFY_MULTIPLIER,
  GAMEDAY_MS,
  GATHER_DURATION_MS,
  gatherYield,
  HARVEST_BONUS,
  HARVEST_GAMEDAYS,
  hasResources,
  HOUR_MS,
  isRaidable,
  OUTPOST_PLUNDER_SHARE,
  outpostName,
  pathLength,
  planIntercept,
  pointAlong,
  remainingPath,
  RESOURCE_NAMES,
  SPOT_NAMES,
  TRADE_INPUT,
  RESOURCES,
  rollChestTroops,
  STARTING_RESOURCES,
  STARTING_TROOPS,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  travelMs,
  victoryPointsCost,
  victoryPointsTrophiesNeeded,
  VICTORY_POINTS_PER_GAMEDAY,
  type AdminState,
  type ArmyStatus,
  type ArmyTarget,
  type ArmyView,
  type CardType,
  type CaravanTrip,
  type Chest,
  type FeedEntry,
  type GamePhase,
  type GameView,
  type LobbyInfo,
  type LogEntry,
  type MapData,
  type Outpost,
  type OutpostView,
  type ResourceSpot,
  type Resources,
  type ResourceType,
  type Vec2,
  planDuo,
  splitByShare,
  type DuoPlan,
  type DuoSourcePick,
  type PactView,
} from '@vectoria/shared';
import {
  dayKey,
  gameTimeBetween,
  isGameTime,
  nextGameTime,
  WEEKDAY_SCHEDULE,
  type Schedule,
} from './calendar';
import { generateMap } from './mapgen';
import { createRandom } from './random';
import { placeBalancedSpots } from './spots';
import {
  createWorld,
  farthestFrom,
  innerLand,
  mainlandTiles,
  outpostCount,
  placeOutposts,
} from './world';

const MAX_LOG = 30;
const MAX_FEED = 60;
const MAX_NAME_LENGTH = 24;
/** A raid only lands if the convoy is within this many tiles of the planned meeting point. */
const RAID_REACH_TILES = 1;
/**
 * Version of the resource spot layout; older running games are re-laid once on load.
 * 3: spot count is a cap, no same-resource clusters.
 * 4: no spot within `SPOT_NEAR_HOURS` of a castle; far spot `SPOT_FAR_HOURS` (2 h).
 * 5: the trader joins as a fourth spot kind.
 * 6: exactly one kind (wood or gold) 2–4 h away, the rest under 2 h; minimum gaps between spots,
 *    no land farther than `SPOT_HOLE_HOURS` from a spot, castle or outpost.
 */
const SPOT_LAYOUT = 6;
/**
 * One-off fixes for running games, applied once on load. 1: gatherers load at the spot of their
 * resource nearest to their home castle (the re-layout had moved them to the spot nearest the old
 * one); moved ones carry the load to the home castle.
 */
const GATHERER_FIX = 1;

interface PlayerRecord {
  id: string;
  name: string;
  /** Login address; null for players registered before email login existed. */
  email: string | null;
  token: string;
  castle: Vec2 | null;
  /** Stored in the home castle; the only resources that can be spent. */
  resources: Resources;
  victoryPoints: number;
  homeTroops: number;
  activity: ResourceType | null;
  pendingActivity: ResourceType | null;
  cards: CardType[];
  /** March card armed for the next army; absent in older saves. */
  activeCard?: CardType | null;
  /** Chests brought home, not yet opened; absent in older saves. */
  chests?: number;
  fortifiedUntil: number | null;
  /** Gameday starts still paying the Füllhorn bonus; absent in older saves. */
  harvestDays?: number;
  /** Shoes stolen: marches started before this clock go barefoot. Absent in older saves. */
  barefootUntil?: number | null;
  /** Victory points bought in `gameday`; absent in older saves and before the first purchase. */
  victoryPointsBought?: { gameday: number; count: number };
  /** Game clock of the last assault on the home castle; absent in older saves. */
  attackedAt?: number;
  /** Won in raids and assaults on other players, spent on every 4th VP; absent in older saves. */
  trophies?: number;
  /** Home castle fell; locked out until every army is home again. Absent in older saves. */
  routed?: boolean;
  /** Outpost stock on the night caravan, home at the next gameday start. Absent in older saves. */
  caravan?: Resources;
  /** Where the caravan's wagons set out and when it arrives (real time); absent when none travels. */
  caravanTrip?: CaravanTrip;
  log: LogEntry[];
}

interface ArmyRecord {
  id: string;
  ownerId: string;
  troops: number;
  status: ArmyStatus;
  /** Base the army returns to: an outpost id, or null for the home castle. */
  baseId: string | null;
  /** Waypoints of the current leg over land; a single point while gathering. */
  path: Vec2[];
  target: ArmyTarget;
  departClock: number;
  /** End of the current leg (arrival, or loading done while gathering). */
  arriveClock: number;
  fog: boolean;
  stealth: boolean;
  forcedMarch: boolean;
  /** Seeweg: this leg runs straight, over water too; absent in older saves. */
  sea?: boolean;
  /** Gathered resources, plunder, stone for the trader or what it was swapped for. */
  cargo: Resources;
  /** On the way to the trader: what the stone is to be swapped for. Absent otherwise. */
  trade?: { gold: number; wood: number };
  /** Carrying an opened chest home (cannot be raided); absent in older saves. */
  chest?: boolean;
  /** Part of a duo attack (`PactRecord`): a group on its way to the meeting point, or the united army. */
  pactId?: string;
}

/** A duo attack between two players; see `PactView` for the fields. */
interface PactRecord extends Omit<PactView, 'initiatorSources'> {
  initiatorSources: DuoSourcePick[];
  /** Once marching: the meeting point. */
  meet?: Vec2;
}

/** Everything needed to restore a game; written to disk by `Persistence`. */
export interface SavedGame {
  version: 2;
  savedAt: number;
  phase: GamePhase;
  seed: number;
  mapSize: number | null;
  clock: number;
  paused: boolean;
  gameday: number;
  lastDayKey: string | null;
  /** Last gameday whose night caravan set out; absent in older saves. */
  caravanDay?: number;
  /** Duo attack offers and pacts; absent in older saves. */
  pacts?: PactRecord[];
  /** Calendar days (YYYY-MM-DD) the admin declared without a gameday; absent in older saves. */
  breakDays?: string[];
  winnerId: string | null;
  nextId: number;
  players: PlayerRecord[];
  armies: ArmyRecord[];
  spots: ResourceSpot[];
  outposts: Outpost[];
  chests: Chest[];
  feed: FeedEntry[];
  /** Spot layout version (`SPOT_LAYOUT`); absent in saves from before balanced spots. */
  spotLayout?: number;
  /** Last applied `GATHERER_FIX`; absent in saves from before it. */
  gathererFix?: number;
}

/** Save format before email login, outposts and land routes. */
interface SavedGameV1 extends Omit<
  SavedGame,
  'version' | 'players' | 'armies' | 'outposts' | 'feed'
> {
  version: 1;
  players: (Omit<PlayerRecord, 'email'> & { gathered?: Resources })[];
  armies: (Omit<ArmyRecord, 'status' | 'baseId' | 'path' | 'cargo'> & {
    status: 'outbound' | 'stationed' | 'returning';
    from: Vec2;
    to: Vec2;
    loot: Resources;
  })[];
}

export type AnySavedGame = SavedGame | SavedGameV1;

export interface GameOptions {
  seed: number;
  hours: 'weekdays' | 'always';
  timezone: string;
  timeScale: number;
  victoryPointsToWin: number;
}

/** Thrown for player commands that are well-formed but not allowed; the message is shown. */
export class RuleError extends Error {}

/** Where troops can stand: the home castle (`id` null) or an owned outpost. */
interface Base {
  id: string | null;
  position: Vec2;
  resources: Resources;
  troops: number;
  setTroops(troops: number): void;
}

/** A target resolved for a march: where to walk and what it is. */
interface Destination {
  path: Vec2[];
  arriveClock: number;
  /** True if the target is one of the sender's own bases (troops and cargo are deposited). */
  ownBase: boolean;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const last = <T>(items: readonly T[]): T => items[items.length - 1]!;

/**
 * Authoritative game state. Mutated only by `update` and validated commands; every mutation sets
 * `dirty` so the persistence layer knows to save.
 */
export class GameState {
  tick = 0;
  dirty = false;
  /**
   * Bumped by events players should see at once (arrivals, battles, a new gameday). The clock
   * alone does not count: clients run it on themselves between the regular state pushes.
   */
  revision = 0;
  map: MapData | null = null;

  private readonly options: GameOptions;
  private data: SavedGame;
  private running = false;
  private readonly online = new Map<string, number>();

  constructor(options: GameOptions, saved?: AnySavedGame) {
    this.options = options;
    if (saved?.mapSize) {
      this.map = generateMap(saved.mapSize, saved.mapSize, saved.seed);
    }
    this.data = saved ? this.migrate(saved) : this.emptyGame(options.seed, []);
    if (saved && this.map && this.data.phase === 'running') {
      this.recallFromLostOutposts();
      if ((this.data.spotLayout ?? 1) < SPOT_LAYOUT) this.relayoutSpots();
      if ((this.data.gathererFix ?? 0) < GATHERER_FIX) this.moveGatherersToNearestSpot();
    }
    if (saved && saved.phase === 'running' && !saved.paused) this.catchUp(saved.savedAt);
  }

  /** Mon–Fri gameday hours in the game time zone, minus the admin's break days. */
  private get schedule(): Schedule {
    return {
      ...WEEKDAY_SCHEDULE,
      timezone: this.options.timezone,
      breakDays: this.data.breakDays ?? [],
    };
  }

  get phase(): GamePhase {
    return this.data.phase;
  }

  toJSON(): SavedGame {
    return { ...this.data, savedAt: Date.now() };
  }

  // ---- Registration & sessions ----

  /** Throws unless registration is open and `rawName` is valid and free; returns it cleaned. */
  checkNewPlayer(rawName: string, email: string): string {
    if (this.data.phase !== 'registration') {
      throw new RuleError('Die Anmeldung ist geschlossen.');
    }
    const name = this.cleanName(rawName);
    if (this.playerIdForEmail(email)) throw new RuleError('Diese E-Mail ist schon angemeldet.');
    return name;
  }

  /** `rawName` trimmed, if valid and not taken by anyone but `ownerId`. */
  private cleanName(rawName: string, ownerId?: string): string {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      throw new RuleError(`Name muss 2–${MAX_NAME_LENGTH} Zeichen lang sein.`);
    }
    if (
      this.data.players.some((p) => p.id !== ownerId && p.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new RuleError('Dieser Name ist schon vergeben.');
    }
    return name;
  }

  register(rawName: string, email: string): { token: string; playerId: string } {
    const player = this.newPlayer(this.checkNewPlayer(rawName, email), email);
    this.data.players.push(player);
    this.dirty = true;
    return { token: player.token, playerId: player.id };
  }

  playerIdForToken(token: string): string | null {
    return this.data.players.find((p) => p.token === token)?.id ?? null;
  }

  playerIdForEmail(email: string): string | null {
    return this.data.players.find((p) => p.email === email)?.id ?? null;
  }

  tokenFor(playerId: string): string | null {
    return this.player(playerId)?.token ?? null;
  }

  setOnline(playerId: string, online: boolean): void {
    const count = (this.online.get(playerId) ?? 0) + (online ? 1 : -1);
    if (count > 0) this.online.set(playerId, count);
    else this.online.delete(playerId);
  }

  lobby(): LobbyInfo {
    return {
      phase: this.data.phase,
      players: this.data.players.map((p) => p.name),
      victoryPointsToWin: this.options.victoryPointsToWin,
    };
  }

  // ---- Player commands ----

  setActivity(playerId: string, resource: ResourceType): void {
    const player = this.requirePlaying(playerId);
    player.pendingActivity = resource;
    this.dirty = true;
  }

  buy(playerId: string, item: 'troops' | 'victoryPoint', count: number): void {
    const player = this.requirePlaying(playerId);
    if (item === 'victoryPoint') {
      const left = VICTORY_POINTS_PER_GAMEDAY - this.victoryPointsToday(player);
      if (count > left) {
        throw new RuleError(
          left > 0
            ? `Heute kannst du nur noch ${left} Siegpunkt${left === 1 ? '' : 'e'} kaufen.`
            : `Pro Spieltag gibt es höchstens ${VICTORY_POINTS_PER_GAMEDAY} Siegpunkte — morgen wieder.`,
        );
      }
    }
    // Victory points get dearer one by one, so their price is the sum over the whole purchase.
    const cost =
      item === 'troops' ? TROOP_BATCH_COST : victoryPointsCost(player.victoryPoints, count);
    const times = item === 'troops' ? count : 1;
    if (!canAfford(player.resources, cost, times)) {
      throw new RuleError('Nicht genug Ressourcen in deiner Burg.');
    }
    // Every 4th victory point needs a trophy reputation; trophies are not spent.
    const trophies =
      item === 'victoryPoint' ? victoryPointsTrophiesNeeded(player.victoryPoints, count) : 0;
    if (trophies > (player.trophies ?? 0)) {
      throw new RuleError(
        `Dafür brauchst du ${trophies} Trophäe${trophies === 1 ? '' : 'n'} — du hast ${player.trophies ?? 0}.`,
      );
    }
    for (const r of RESOURCES) player.resources[r] -= cost[r] * times;
    if (item === 'troops') {
      player.homeTroops += count * TROOP_BATCH_SIZE;
    } else {
      player.victoryPoints += count;
      player.victoryPointsBought = {
        gameday: this.data.gameday,
        count: this.victoryPointsToday(player) + count,
      };
      this.addLog(player, `Du hast ${count} Siegpunkt(e) gekauft.`);
      if (player.victoryPoints >= this.options.victoryPointsToWin) this.finish(player.id);
    }
    this.dirty = true;
  }

  sendArmy(
    playerId: string,
    from: string | null,
    troops: number,
    target: ArmyTarget,
    useActiveCard: boolean,
    cargo: Resources,
    trade?: { gold: number; wood: number },
  ): void {
    const player = this.requirePlaying(playerId);
    const base = this.base(player, from);
    if (!base) throw new RuleError('Dieser Stützpunkt gehört dir nicht.');
    if (troops > base.troops) throw new RuleError('So viele Truppen stehen dort nicht.');
    const card = useActiveCard ? (player.activeCard ?? null) : null;
    if (useActiveCard && !card) throw new RuleError('Du hast keine Karte aktiviert.');
    const cards = card ? [card] : [];
    if (
      target.kind === (from === null ? 'castle' : 'outpost') &&
      target.id === (from ?? playerId)
    ) {
      throw new RuleError('Die Truppen sind schon dort.');
    }
    const forcedMarch = cards.includes('forcedMarch');
    const sea = cards.includes('sea');
    if (sea && target.kind === 'army') {
      throw new RuleError('Mit dem Seeweg lässt sich kein Zug überfallen.');
    }
    // Resource cargo slows the march, like convoys heading home from a spot.
    const speed = (hasResources(cargo) ? LOADED_SPEED : 1) * this.marchSpeed(player);
    const destination = this.destination(player, base.position, target, forcedMarch, speed, sea);
    this.checkChestTroops(target, troops);
    this.checkTrade(base.resources, target, cargo, trade);

    if (card) {
      player.cards.splice(player.cards.indexOf(card), 1);
      player.activeCard = null;
    }
    base.setTroops(base.troops - troops);
    for (const r of RESOURCES) base.resources[r] -= cargo[r];
    const army: ArmyRecord = {
      id: this.nextId('army'),
      ownerId: playerId,
      troops,
      status: 'outbound',
      baseId: from,
      path: destination.path,
      target,
      departClock: this.data.clock,
      arriveClock: destination.arriveClock,
      fog: cards.includes('fog'),
      stealth: cards.includes('stealth'),
      forcedMarch,
      sea,
      cargo: { ...cargo },
      chest: false,
      ...(trade ? { trade: { ...trade } } : {}),
    };
    this.data.armies.push(army);
    // A stealth march sets out unannounced: the ticker would give away that something is afoot.
    if (!army.stealth) {
      this.addFeed(
        target.kind === 'army' ? 'battle' : 'march',
        `${this.armyLabel(army)} ${this.marchPhrase(army)}` +
          (hasResources(cargo) ? ` (mit ${formatResources(cargo)})` : '') +
          '.',
        army.id,
      );
    }
    this.dirty = true;
  }

  /**
   * Cargo goes only to the trader: stone, swapped for `trade` (gold + wood = stone). Stock never
   * moves between own bases by hand — the night caravan does that (`sendCaravans`).
   */
  private checkTrade(
    stock: Resources,
    target: ArmyTarget,
    cargo: Resources,
    trade: { gold: number; wood: number } | undefined,
  ): void {
    const toTrader = this.isTrader(target);
    if (!hasResources(cargo) && !trade) {
      if (toTrader) throw new RuleError('Ohne Stein gibt es beim Händler nichts zu tauschen.');
      return;
    }
    if (!toTrader) {
      throw new RuleError(
        'Ressourcen bleiben im Lager — die Karawane bringt sie um 18 Uhr in die Burg.',
      );
    }
    const amount = cargo[TRADE_INPUT];
    if (RESOURCES.some((r) => r !== TRADE_INPUT && cargo[r] > 0) || amount <= 0 || !trade) {
      throw new RuleError('Zum Händler nimmst du nur Stein mit.');
    }
    if (trade.gold + trade.wood !== amount) {
      throw new RuleError('Gold und Holz zusammen müssen so viel sein wie der Stein.');
    }
    if (!canAfford(stock, cargo)) throw new RuleError('So viel Stein lagert dort nicht.');
  }

  private isTrader(target: ArmyTarget): boolean {
    return (
      target.kind === 'spot' &&
      this.data.spots.find((s) => s.id === target.id)?.resource === 'trader'
    );
  }

  /** At the trader: the stone carried is swapped at once, and the army heads home loaded. */
  private tradeAt(army: ArmyRecord, owner: PlayerRecord): void {
    const stone = army.cargo[TRADE_INPUT];
    const plan = army.trade ?? { gold: stone, wood: 0 };
    if (stone > 0) {
      const gold = Math.min(plan.gold, stone);
      army.cargo = { ...emptyResources(), gold, wood: stone - gold };
      const got = formatResources(army.cargo);
      this.addLog(owner, `Beim Händler ${stone} Stein gegen ${got} getauscht — auf dem Heimweg.`);
      this.addFeed(
        'gather',
        `${this.armyLabel(army)} handelt beim Händler und zieht mit ${got} heim.`,
        army.id,
      );
    } else {
      this.addLog(owner, 'Dein Zug kam ohne Stein beim Händler an und kehrt leer heim.');
    }
    this.startReturn(army, last(army.path));
  }

  redirectArmy(playerId: string, armyId: string, target: ArmyTarget): void {
    const player = this.requirePlaying(playerId);
    const army = this.data.armies.find((a) => a.id === armyId && a.ownerId === playerId);
    if (!army) throw new RuleError('Unbekannter Truppenzug.');
    if (army.pactId) throw new RuleError('Ein Duo-Zug lässt sich nicht umleiten.');
    // Stone bound for the trader goes there or back (recall), never to another store.
    if (army.trade && army.status === 'outbound') {
      throw new RuleError('Ein Zug zum Händler lässt sich nur zurückrufen.');
    }
    if (this.isTrader(target)) {
      throw new RuleError('Zum Händler geht es nur mit Stein direkt aus einer Burg.');
    }
    // Loaded armies (yield, plunder, a chest) may only switch to another own store.
    if (hasResources(army.cargo) || army.chest) {
      this.redirectHome(player, army, target);
      return;
    }
    // Empty-handed armies can be re-routed anywhere, even on their way home.
    if (target.kind === 'army' && target.id === army.id) throw new RuleError('Ungültiges Ziel.');
    if (army.target.kind === target.kind && army.target.id === target.id) {
      throw new RuleError('Der Zug ist schon dorthin unterwegs.');
    }
    const destination = this.destination(
      player,
      this.armyPosition(army),
      target,
      army.forcedMarch,
      this.marchSpeed(player),
    );
    this.checkChestTroops(target, army.troops);
    this.endRouteCards(army);
    army.status = 'outbound';
    army.path = destination.path;
    army.target = target;
    army.departClock = this.data.clock;
    army.arriveClock = destination.arriveClock;
    if (!army.stealth) {
      this.addFeed(
        target.kind === 'army' ? 'battle' : 'march',
        `${this.armyLabel(army)} schwenkt um und ${this.marchPhrase(army)}.`,
        army.id,
      );
    }
    this.dirty = true;
  }

  /** A loaded army heads for another own base (castle or outpost) to store its load there. */
  private redirectHome(player: PlayerRecord, army: ArmyRecord, target: ArmyTarget): void {
    const outpost =
      target.kind === 'outpost' ? this.data.outposts.find((o) => o.id === target.id) : undefined;
    const ownCastle = target.kind === 'castle' && target.id === player.id;
    if (!ownCastle && outpost?.ownerId !== player.id) {
      throw new RuleError('Ein beladener Zug kann nur zu einer eigenen Burg umgeleitet werden.');
    }
    const baseId = ownCastle ? null : outpost!.id;
    if (army.status === 'returning' && army.baseId === baseId) {
      throw new RuleError('Der Zug ist schon dorthin unterwegs.');
    }
    army.baseId = baseId;
    this.endRouteCards(army);
    this.startReturn(army, this.armyPosition(army));
    this.addFeed(
      'march',
      `${this.armyLabel(army)} schwenkt um und zieht zu einem anderen Lager.`,
      army.id,
    );
    this.dirty = true;
  }

  recallArmy(playerId: string, armyId: string): void {
    this.requirePlaying(playerId);
    const army = this.data.armies.find((a) => a.id === armyId && a.ownerId === playerId);
    if (!army) throw new RuleError('Unbekannter Truppenzug.');
    if (army.pactId) throw new RuleError('Einen Duo-Angriff könnt ihr nur gemeinsam abbrechen.');
    if (army.status === 'returning') throw new RuleError('Der Zug ist bereits auf dem Rückweg.');
    this.startReturn(army, this.armyPosition(army));
    this.addFeed('march', `${this.armyLabel(army)} kehrt um.`, army.id);
    this.dirty = true;
  }

  /**
   * Instant cards take effect now; march cards are armed for the next army. Null disarms.
   * `target` is the own outpost (Hofumzug) or the other player (Schuhe klauen).
   */
  activateCard(playerId: string, card: CardType | null, target?: string): void {
    const player = this.requirePlaying(playerId);
    if (card === null) {
      player.activeCard = null;
      this.dirty = true;
      return;
    }
    const index = player.cards.indexOf(card);
    if (index < 0) throw new RuleError(`Du hast keine ${CARDS[card].name}-Karte.`);
    if (CARDS[card].use === 'march') {
      player.activeCard = card;
      this.dirty = true;
      return;
    }
    // Validate before the card is spent.
    const apply = this.instantCard(player, card, target);
    player.cards.splice(index, 1);
    if (player.activeCard && !player.cards.includes(player.activeCard)) player.activeCard = null;
    apply();
    this.revision++;
    this.dirty = true;
  }

  /** Checks an instant card's target and returns its effect. */
  private instantCard(player: PlayerRecord, card: CardType, target?: string): () => void {
    switch (card) {
      case 'fortify':
        return () => {
          player.fortifiedUntil =
            Math.max(player.fortifiedUntil ?? 0, this.data.clock) + FORTIFY_DURATION_MS;
          this.addLog(player, 'Bollwerk aktiv: deine Burg verteidigt mit +50 %.');
          this.addFeed('battle', `${player.name} verstärkt die Burg mit einem Bollwerk.`);
        };
      case 'harvest':
        return () => {
          player.harvestDays = (player.harvestDays ?? 0) + HARVEST_GAMEDAYS;
          this.addLog(
            player,
            `Füllhorn: die nächsten ${player.harvestDays} Spieltage je +${HARVEST_BONUS} Holz, Stein und Gold extra.`,
          );
          this.addFeed('day', `${player.name} öffnet ein Füllhorn.`);
        };
      case 'stealShoes': {
        const victim = target ? this.player(target) : undefined;
        if (!victim || !victim.castle) throw new RuleError('Wähle jemanden aus.');
        if (victim === player) throw new RuleError('Deine eigenen Schuhe brauchst du noch.');
        return () => {
          victim.barefootUntil =
            Math.max(victim.barefootUntil ?? 0, this.data.clock) + BAREFOOT_DURATION_MS;
          this.addLog(
            victim,
            `${player.name} hat dir die Schuhe geklaut: deine Züge laufen einen Spieltag lang langsamer.`,
          );
          this.addLog(player, `Du hast ${victim.name} die Schuhe geklaut.`);
          this.addFeed('march', `${player.name} klaut ${victim.name} die Schuhe.`);
        };
      }
      case 'relocate': {
        const outpost = this.data.outposts.find((o) => o.id === target);
        if (!outpost || outpost.ownerId !== player.id) {
          throw new RuleError('Wähle einen deiner Stützpunkte.');
        }
        if (!player.castle) throw new RuleError('Du hast keine Burg.');
        return () => this.relocate(player, outpost);
      }
      default:
        throw new RuleError('Diese Karte wirkt nicht sofort.');
    }
  }

  /**
   * Hofumzug: the home castle and one of the player's outposts swap places; troops and stores stay
   * with their base. Armies heading for either re-route from where they stand.
   */
  private relocate(player: PlayerRecord, outpost: Outpost): void {
    [player.castle, outpost.position] = [outpost.position, player.castle!];
    this.rerouteToMoved(
      (army) =>
        (army.target.kind === 'castle' && army.target.id === player.id) ||
        (army.target.kind === 'outpost' && army.target.id === outpost.id),
    );
    this.addLog(player, 'Hofumzug: deine Burg und dein Stützpunkt haben die Plätze getauscht.');
    this.addFeed('outpost', `${player.name} verlegt den Hof — Burg und Stützpunkt tauschen.`);
  }

  /**
   * After bases moved: armies whose march `heads` for a moved base re-route from where they stand
   * (returners to their base, everyone else to the target's new place).
   */
  private rerouteToMoved(heads: (army: ArmyRecord) => boolean): void {
    for (const army of this.data.armies) {
      if (army.status === 'gathering' || !heads(army)) continue;
      const position = this.armyPosition(army);
      if (army.status === 'returning') {
        this.startReturn(army, position);
        continue;
      }
      const to =
        army.target.kind === 'castle'
          ? this.player(army.target.id)?.castle
          : this.data.outposts.find((o) => o.id === army.target.id)?.position;
      if (to) this.reroute(army, position, to);
    }
  }

  /** Opens a chest the player brought home and returns the card inside. */
  openChest(playerId: string): CardType {
    const player = this.requirePlaying(playerId);
    if (!player.chests) throw new RuleError('Du hast keine ungeöffnete Truhe.');
    player.chests--;
    const card = drawCard();
    player.cards.push(card);
    this.addLog(player, `Truhe geöffnet: Karte „${CARDS[card].name}“ erhalten.`);
    this.dirty = true;
    return card;
  }

  // ---- Duo attacks ----

  /** Offers a duo attack: own stationed troops from `sources`, `partnerTroops` asked of `partnerId`. */
  offerDuo(
    playerId: string,
    partnerId: string,
    target: ArmyTarget,
    sources: DuoSourcePick[],
    partnerTroops: number,
  ): void {
    const player = this.requirePlaying(playerId);
    const partner = this.player(partnerId);
    if (!partner?.castle || partner.id === player.id) {
      throw new RuleError('Wähle jemand anderen als Partner.');
    }
    this.checkDuoTarget(target, player, partner);
    const picks = this.duoGroups(player, sources);
    if (partnerTroops > this.stationed(partner)) {
      throw new RuleError(`So viele Truppen hat ${partner.name} nicht stationiert.`);
    }
    const pact: PactRecord = {
      id: this.nextId('pact'),
      initiatorId: player.id,
      partnerId: partner.id,
      target,
      initiatorSources: picks.map((g) => ({ from: g.base.id, troops: g.troops })),
      initiatorTroops: picks.reduce((sum, g) => sum + g.troops, 0),
      partnerTroops,
      status: 'offered',
      gameday: this.data.gameday,
      meetClock: null,
      attackClock: null,
      abortBy: null,
    };
    // The partner bringing everything from home is the plan the offer is shown with.
    const home = { base: this.base(partner, null)!, troops: partnerTroops, player: partner };
    if (!this.planPact(pact.target, [...picks, home])) {
      throw new RuleError('Kein Landweg für diesen Duo-Angriff.');
    }
    (this.data.pacts ??= []).push(pact);
    const plan = `${this.targetName(target)} mit ${pact.initiatorTroops} + ${partnerTroops} Truppen`;
    this.addLog(player, `Duo-Angriff angeboten an ${partner.name}: ${plan}.`);
    this.addLog(partner, `${player.name} bietet dir einen Duo-Angriff an: ${plan} (Posteingang).`);
    this.revision++;
    this.dirty = true;
  }

  /** The initiator takes back an unanswered offer. */
  withdrawDuo(playerId: string, pactId: string): void {
    const player = this.requirePlaying(playerId);
    const pact = this.pact(pactId);
    if (!pact || pact.initiatorId !== player.id || pact.status !== 'offered') {
      throw new RuleError('Dieses Angebot gibt es nicht (mehr).');
    }
    this.dropPact(pact);
    const partner = this.player(pact.partnerId);
    if (partner) this.addLog(partner, `${player.name} hat das Duo-Angebot zurückgezogen.`);
    this.dirty = true;
  }

  /** The partner declines, or accepts with own troops from `sources`: the attack starts at once. */
  answerDuo(playerId: string, pactId: string, accept: boolean, sources: DuoSourcePick[]): void {
    const partner = this.requirePlaying(playerId);
    const pact = this.pact(pactId);
    if (!pact || pact.partnerId !== partner.id || pact.status !== 'offered') {
      throw new RuleError('Dieses Angebot gibt es nicht (mehr).');
    }
    const initiator = this.player(pact.initiatorId);
    if (!accept || !initiator) {
      this.dropPact(pact);
      if (initiator) this.addLog(initiator, `${partner.name} lehnt deinen Duo-Angriff ab.`);
      this.dirty = true;
      return;
    }
    if (initiator.routed || !initiator.castle) {
      throw new RuleError(`${initiator.name} kann gerade nicht handeln.`);
    }
    this.checkDuoTarget(pact.target, initiator, partner);
    const own = this.duoGroups(initiator, pact.initiatorSources, `${initiator.name} hat`);
    const theirs = this.duoGroups(partner, sources);
    if (theirs.reduce((sum, g) => sum + g.troops, 0) !== pact.partnerTroops) {
      throw new RuleError(`Verlangt sind genau ${pact.partnerTroops} Truppen.`);
    }
    const groups = [...own, ...theirs];
    const plan = this.planPact(pact.target, groups);
    if (!plan) throw new RuleError('Kein Landweg für diesen Duo-Angriff.');

    groups.forEach((g, i) => {
      g.base.setTroops(g.base.troops - g.troops);
      const leg = plan.legs[i]!;
      this.data.armies.push({
        id: this.nextId('army'),
        ownerId: g.player.id,
        troops: g.troops,
        status: 'outbound',
        baseId: g.base.id,
        path: leg.path,
        target: pact.target,
        departClock: this.data.clock,
        arriveClock: this.data.clock + leg.ms,
        fog: false,
        stealth: false,
        forcedMarch: false,
        cargo: emptyResources(),
        chest: false,
        pactId: pact.id,
      });
    });
    pact.status = 'marching';
    pact.meet = plan.meet;
    pact.meetClock = this.data.clock + plan.meetMs;
    pact.attackClock = this.data.clock + plan.totalMs;
    const reveal = formatSpan(plan.meetMs);
    this.addLog(
      initiator,
      `${partner.name} macht mit: Duo-Angriff läuft, Treffpunkt in ${reveal}.`,
    );
    this.addLog(partner, `Duo-Angriff mit ${initiator.name} läuft, Treffpunkt in ${reveal}.`);
    this.addFeed(
      'march',
      `${initiator.name} und ${partner.name} ziehen gemeinsam los — Ziel unbekannt.`,
    );
    this.revision++;
    this.dirty = true;
  }

  /**
   * Calling a duo attack off takes both: the first call asks, the other participant's call
   * agrees (then everyone heads home); the asker calling again takes the request back.
   */
  abortDuo(playerId: string, pactId: string): void {
    const player = this.requirePlaying(playerId);
    const pact = this.pact(pactId);
    if (!pact || pact.status === 'offered' || !this.inPact(pact, player.id)) {
      throw new RuleError('Diesen Duo-Angriff gibt es nicht (mehr).');
    }
    const other = this.player(pact.initiatorId === player.id ? pact.partnerId : pact.initiatorId);
    if (pact.abortBy === null) {
      pact.abortBy = player.id;
      if (other)
        this.addLog(other, `${player.name} möchte den Duo-Angriff abbrechen (Posteingang).`);
    } else if (pact.abortBy === player.id) {
      pact.abortBy = null;
      if (other) this.addLog(other, `${player.name} will den Duo-Angriff doch fortsetzen.`);
    } else {
      this.disbandPact(pact, 'Duo-Angriff gemeinsam abgebrochen — alle Truppen ziehen heim.');
    }
    this.dirty = true;
  }

  /** A duo target: a castle (not protected after a fall) or owned outpost of a third player. */
  private checkDuoTarget(target: ArmyTarget, a: PlayerRecord, b: PlayerRecord): void {
    if (target.kind === 'castle') {
      const owner = this.player(target.id);
      if (!owner?.castle || owner.id === a.id || owner.id === b.id) {
        throw new RuleError('Duo-Angriffe gehen nur gegen eine fremde Burg.');
      }
      if (owner.routed) {
        throw new RuleError(`Die Burg von ${owner.name} ist gefallen und gerade geschützt.`);
      }
      return;
    }
    if (target.kind === 'outpost') {
      const outpost = this.data.outposts.find((o) => o.id === target.id);
      if (!outpost?.ownerId || outpost.ownerId === a.id || outpost.ownerId === b.id) {
        throw new RuleError('Duo-Angriffe gehen nur gegen einen fremden Stützpunkt.');
      }
      return;
    }
    throw new RuleError('Duo-Angriffe gehen nur gegen Burgen und Stützpunkte.');
  }

  /** Validates troop picks from the player's bases (merged per base); stationed troops only. */
  private duoGroups(
    player: PlayerRecord,
    sources: DuoSourcePick[],
    who = 'Du hast',
  ): { base: Base; troops: number; player: PlayerRecord }[] {
    const merged = new Map<string | null, number>();
    for (const s of sources) merged.set(s.from, (merged.get(s.from) ?? 0) + s.troops);
    const groups = [...merged].map(([from, troops]) => {
      const base = this.base(player, from);
      if (!base) throw new RuleError(`${who} diesen Stützpunkt nicht mehr.`);
      if (troops > base.troops) throw new RuleError(`${who} dort nicht mehr so viele Truppen.`);
      return { base, troops, player };
    });
    if (groups.length === 0) throw new RuleError('Ohne Truppen kein Duo-Angriff.');
    return groups;
  }

  /** Troops at home and in all own outposts. */
  private stationed(player: PlayerRecord): number {
    return (
      player.homeTroops +
      this.data.outposts
        .filter((o) => o.ownerId === player.id)
        .reduce((sum, o) => sum + o.troops, 0)
    );
  }

  /** The duo plan for these groups (legs in the same order). */
  private planPact(
    target: ArmyTarget,
    groups: { base: Base; player: PlayerRecord }[],
  ): DuoPlan | null {
    const to = this.targetPosition(target);
    if (!to) return null;
    return planDuo(
      this.map!,
      groups.map((g) => ({ position: g.base.position, speed: this.marchSpeed(g.player) })),
      to,
    );
  }

  private targetPosition(target: ArmyTarget): Vec2 | null {
    if (target.kind === 'castle') return this.player(target.id)?.castle ?? null;
    if (target.kind === 'outpost') {
      return this.data.outposts.find((o) => o.id === target.id)?.position ?? null;
    }
    return null;
  }

  private targetName(target: ArmyTarget): string {
    if (target.kind === 'castle') return `Burg von ${this.player(target.id)?.name ?? '?'}`;
    return this.outpostName(target.id);
  }

  private pact(id: string): PactRecord | undefined {
    return this.data.pacts?.find((p) => p.id === id);
  }

  private inPact(pact: PactRecord, playerId: string): boolean {
    return pact.initiatorId === playerId || pact.partnerId === playerId;
  }

  private dropPact(pact: PactRecord): void {
    this.data.pacts = (this.data.pacts ?? []).filter((p) => p !== pact);
    this.revision++;
  }

  /** A duo group reached the meeting point; the last one to arrive unites them all. */
  private arriveAtMeet(army: ArmyRecord, pact: PactRecord): void {
    army.status = 'waiting';
    army.path = [last(army.path)];
    army.departClock = this.data.clock;
    army.arriveClock = Math.max(this.data.clock, pact.meetClock ?? this.data.clock);
    const groups = this.data.armies.filter((a) => a.pactId === pact.id);
    if (groups.some((a) => a.status !== 'waiting')) return;

    const initiator = this.player(pact.initiatorId);
    const partner = this.player(pact.partnerId);
    const to = this.targetPosition(pact.target);
    const path = to && pact.meet ? findPath(this.map!, pact.meet, to) : null;
    if (!initiator || !partner || !path) {
      this.disbandPact(pact, 'Das Duo-Ziel ist nicht mehr erreichbar — alle ziehen heim.');
      return;
    }
    const shares = this.pactShares(pact, groups);
    pact.initiatorTroops = shares[0];
    pact.partnerTroops = shares[1];
    this.data.armies = this.data.armies.filter((a) => a.pactId !== pact.id);
    const pace = Math.min(this.marchSpeed(initiator), this.marchSpeed(partner));
    const duo: ArmyRecord = {
      id: this.nextId('army'),
      ownerId: initiator.id,
      troops: shares[0] + shares[1],
      status: 'outbound',
      baseId: null,
      path,
      target: pact.target,
      departClock: this.data.clock,
      arriveClock: this.data.clock + travelMs(pathLength(path), this.map!.width, false, pace),
      fog: false,
      stealth: false,
      forcedMarch: false,
      cargo: emptyResources(),
      chest: false,
      pactId: pact.id,
    };
    this.data.armies.push(duo);
    pact.status = 'united';
    pact.attackClock = duo.arriveClock;
    this.addFeed(
      'march',
      `${initiator.name} und ${partner.name} vereinen sich zum Duo-Zug (${duo.troops} Truppen) und ziehen gegen die ${this.targetName(pact.target)}.`,
      duo.id,
    );
  }

  /** Troops each participant has in the pact's armies: [initiator, partner]. */
  private pactShares(pact: PactRecord, armies: ArmyRecord[]): [number, number] {
    let a = 0;
    let b = 0;
    for (const army of armies) {
      if (army.ownerId === pact.initiatorId) a += army.troops;
      else b += army.troops;
    }
    return [a, b];
  }

  /**
   * Ends a pact early (both agreed, the target is gone, a participant left): groups on the way to
   * the meeting point turn back to where they set out, a united army splits by share and each
   * part heads to its home castle.
   */
  private disbandPact(pact: PactRecord, text: string): void {
    this.dropPact(pact);
    for (const army of this.data.armies.filter((a) => a.pactId === pact.id)) {
      delete army.pactId;
      if (pact.status !== 'united') {
        this.startReturn(army, this.armyPosition(army));
        continue;
      }
      const where = this.armyPosition(army);
      this.data.armies = this.data.armies.filter((a) => a !== army);
      const parts = splitByShare(army.troops, [pact.initiatorTroops, pact.partnerTroops]);
      [pact.initiatorId, pact.partnerId].forEach((id, i) => {
        const owner = this.player(id);
        if (owner?.castle && parts[i]! > 0) {
          this.data.armies.push(this.fleeingArmy(owner, where, parts[i]!, emptyResources()));
        }
      });
    }
    for (const id of [pact.initiatorId, pact.partnerId]) {
      const player = this.player(id);
      if (player) {
        this.addLog(player, text);
        this.liftRout(player);
      }
    }
  }

  /**
   * The duo army reaches its target: one battle by the usual rules, with losses, plunder and the
   * chest shared out by the troops each brought. After it each side marches home on its own.
   */
  private duoAssault(army: ArmyRecord, pact: PactRecord): void {
    const initiator = this.player(pact.initiatorId);
    const partner = this.player(pact.partnerId);
    const where = last(army.path);
    const shares = [pact.initiatorTroops, pact.partnerTroops];
    const castleOwner = pact.target.kind === 'castle' ? this.player(pact.target.id) : undefined;
    const outpost =
      pact.target.kind === 'outpost'
        ? this.data.outposts.find((o) => o.id === pact.target.id)
        : undefined;
    const valid =
      initiator &&
      partner &&
      (castleOwner
        ? castleOwner.castle && !castleOwner.routed
        : outpost && outpost.ownerId !== initiator.id && outpost.ownerId !== partner.id);
    if (!valid) {
      this.disbandPact(pact, 'Das Duo-Ziel ist nicht mehr angreifbar — alle ziehen heim.');
      return;
    }
    const names = `${initiator.name} und ${partner.name}`;
    const sides = [initiator, partner];
    this.dropPact(pact);
    this.data.armies = this.data.armies.filter((a) => a !== army);

    const defending = castleOwner ? castleOwner.homeTroops : outpost!.troops;
    const fortified = castleOwner ? (castleOwner.fortifiedUntil ?? 0) > this.data.clock : false;
    const attackerWins = army.troops > defending * (fortified ? FORTIFY_MULTIPLIER : 1);
    const losses = battleLosses(army.troops, defending, attackerWins);
    const lost = splitByShare(losses.attacker, shares);
    const survivors = shares.map((s, i) => (attackerWins ? Math.max(1, s - lost[i]!) : 0));
    const label = castleOwner
      ? `die Burg von ${castleOwner.name}`
      : `den ${this.outpostName(outpost!.id)}`;

    if (castleOwner) {
      castleOwner.attackedAt = this.data.clock;
      castleOwner.homeTroops -= losses.defender;
    } else {
      outpost!.attackedAt = this.data.clock;
      outpost!.troops -= losses.defender;
    }
    if (!attackerWins) {
      for (const p of sides) {
        this.addLog(p, `Duo-Angriff auf ${label} gescheitert: der Duo-Zug ist gefallen.`);
        this.liftRout(p);
      }
      const defender =
        castleOwner ?? (outpost!.ownerId ? this.player(outpost!.ownerId) : undefined);
      if (defender) {
        this.addLog(defender, `Duo-Angriff von ${names} abgewehrt. ${losses.defender} Verluste.`);
      }
      this.addFeed(
        'battle',
        `${label[0]!.toUpperCase()}${label.slice(1)} wehrt den Duo-Angriff von ${names} ab.`,
      );
      return;
    }

    let loot: Resources;
    if (castleOwner) {
      loot = takeShare(castleOwner.resources, CASTLE_PLUNDER_SHARE);
    } else {
      const defender = outpost!.ownerId ? this.player(outpost!.ownerId) : undefined;
      const kept = takeShare(outpost!.resources, 1 - OUTPOST_PLUNDER_SHARE);
      if (defender?.castle && outpost!.troops > 0) {
        this.data.armies.push(this.fleeingArmy(defender, outpost!.position, outpost!.troops, kept));
      }
      if (defender) {
        this.recallFromLostOutpost(defender, outpost!.id, this.outpostName(outpost!.id));
        this.addLog(defender, `${names} haben deinen Stützpunkt im Duo erobert.`);
      }
      loot = takeShare(outpost!.resources, 1);
    }
    const parts = shares.map(() => emptyResources());
    for (const r of RESOURCES) {
      splitByShare(loot[r], shares).forEach((amount, i) => (parts[i]![r] = amount));
    }
    // The chest (castle) and the outpost go by lot / by the larger share.
    const lot = Math.random() * (shares[0]! + shares[1]!) < shares[0]! ? 0 : 1;
    const keeper =
      shares[0]! > shares[1]! ? 0 : shares[1]! > shares[0]! ? 1 : Math.random() < 0.5 ? 0 : 1;

    // Owned outposts and castles only: rebuilding a ruin together is no victory.
    if (castleOwner || outpost!.ownerId) {
      for (const p of sides) {
        this.awardTrophy(p);
        this.addLog(p, 'Der Duo-Sieg bringt dir eine Trophäe.');
      }
    }
    sides.forEach((p, i) => {
      if (!castleOwner && i === keeper) {
        outpost!.ownerId = p.id;
        outpost!.troops = survivors[i]!;
        outpost!.resources = parts[i]!;
        this.addLog(
          p,
          `Duo-Sieg: ${this.outpostName(outpost!.id)} gehört jetzt dir, samt ${formatResources(parts[i]!)}.`,
        );
        return;
      }
      const home = this.fleeingArmy(p, where, survivors[i]!, parts[i]!);
      home.chest = Boolean(castleOwner) && i === lot;
      this.data.armies.push(home);
      this.addLog(
        p,
        `Duo-Sieg gegen ${label}: deine ${survivors[i]} Truppen ziehen heim mit ${formatResources(parts[i]!)}` +
          (home.chest ? ' und der Truhe.' : '.'),
      );
    });
    if (castleOwner) {
      this.addLog(
        castleOwner,
        `${names} haben deine Burg im Duo gestürmt. ${losses.defender} Verteidiger gefallen.`,
      );
      this.addFeed('battle', `${names} stürmen im Duo die Burg von ${castleOwner.name}.`);
      this.rout(castleOwner);
      this.turnBackAssaults(castleOwner);
    } else {
      this.addFeed('outpost', `${names} erobern im Duo den ${this.outpostName(outpost!.id)}.`);
    }
    for (const p of sides) this.liftRout(p);
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
    // 18:00: the gameday is over, the night caravans set out.
    if (!inHours && !this.data.paused) this.sendCaravans(now);

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

  /** Moves the game clock forward, resolving every arrival in order. */
  private advance(dClock: number): void {
    const end = this.data.clock + dClock;
    for (;;) {
      // Duo groups waiting at the meeting point move on when the last one arrives.
      const next = this.data.armies
        .filter((a) => a.status !== 'waiting' && a.arriveClock <= end)
        .sort((a, b) => a.arriveClock - b.arriveClock)[0];
      if (!next || this.data.phase !== 'running') break;
      this.data.clock = Math.max(this.data.clock, next.arriveClock);
      this.arrive(next);
      this.revision++;
    }
    this.data.clock = end;
    this.dirty = true;
  }

  private arrive(army: ArmyRecord): void {
    const owner = this.player(army.ownerId);
    if (!owner) {
      this.removeArmy(army);
      return;
    }
    if (army.pactId && army.status === 'outbound') {
      const pact = this.pact(army.pactId);
      if (pact?.status === 'marching') return this.arriveAtMeet(army, pact);
      if (pact?.status === 'united') return this.duoAssault(army, pact);
      delete army.pactId;
      this.startReturn(army, last(army.path));
      return;
    }
    if (army.status === 'gathering') {
      this.finishGathering(army, owner);
      return;
    }
    if (army.status === 'returning') {
      const base = this.base(owner, army.baseId);
      if (base) {
        this.deposit(army, owner, base);
      } else {
        // The outpost fell while the army was on its way; head for the home castle instead.
        army.baseId = null;
        this.startReturn(army, last(army.path));
      }
      return;
    }

    switch (army.target.kind) {
      case 'spot': {
        const spot = this.data.spots.find((s) => s.id === army.target.id);
        if (!spot) {
          this.startReturn(army, last(army.path));
          return;
        }
        if (spot.resource === 'trader') {
          this.tradeAt(army, owner);
          return;
        }
        army.status = 'gathering';
        army.path = [spot.position];
        army.departClock = this.data.clock;
        army.arriveClock = this.data.clock + GATHER_DURATION_MS;
        return;
      }
      case 'chest': {
        const index = this.data.chests.findIndex((c) => c.id === army.target.id);
        const chest = this.data.chests[index];
        if (!chest) {
          this.addLog(owner, 'Die Truhe war schon weg.');
        } else if (army.troops < chest.troopsNeeded) {
          this.addLog(
            owner,
            `Deine ${army.troops} Truppen bekommen die Truhe nicht auf (${chest.troopsNeeded} nötig).`,
          );
        } else {
          this.data.chests.splice(index, 1);
          army.chest = true;
          this.addLog(owner, 'Truhe geborgen — deine Truppen bringen sie heim.');
          this.addFeed('chest', `${this.armyLabel(army)} birgt eine Truhe.`, army.id);
        }
        this.startReturn(army, last(army.path));
        return;
      }
      case 'castle': {
        if (army.target.id === owner.id) {
          this.deposit(army, owner, this.base(owner, null)!);
        } else {
          this.assaultCastle(army, owner);
        }
        return;
      }
      case 'outpost': {
        const outpost = this.data.outposts.find((o) => o.id === army.target.id);
        if (!outpost) {
          this.startReturn(army, last(army.path));
        } else if (outpost.ownerId === owner.id) {
          this.deposit(army, owner, this.base(owner, outpost.id)!);
        } else {
          this.assaultOutpost(army, owner, outpost);
        }
        return;
      }
      case 'army':
        this.raid(army, owner);
        return;
    }
  }

  private finishGathering(army: ArmyRecord, owner: PlayerRecord): void {
    const spot = this.data.spots.find((s) => s.id === army.target.id);
    if (spot && spot.resource !== 'trader') {
      const amount = gatherYield(army.troops);
      army.cargo[spot.resource] += amount;
      this.addLog(
        owner,
        `Deine ${army.troops} Truppen haben ${amount} ${RESOURCE_NAMES[spot.resource]} geladen und ziehen heim.`,
      );
      this.addFeed(
        'gather',
        `${this.armyLabel(army)} zieht mit ${amount} ${RESOURCE_NAMES[spot.resource]} heim.`,
        army.id,
      );
    }
    this.startReturn(army, army.path[0]!);
  }

  /** Troops and cargo move into one of the owner's bases; the army ends. */
  private deposit(army: ArmyRecord, owner: PlayerRecord, base: Base): void {
    base.setTroops(base.troops + army.troops);
    for (const r of RESOURCES) base.resources[r] += army.cargo[r];
    if (hasResources(army.cargo)) {
      const where = base.id === null ? 'deine Burg' : 'deinen Stützpunkt';
      this.addLog(owner, `${formatResources(army.cargo)} in ${where} eingelagert.`);
    }
    if (army.chest) {
      owner.chests = (owner.chests ?? 0) + 1;
      this.addLog(owner, 'Eine Truhe ist daheim angekommen und wartet darauf, geöffnet zu werden.');
    }
    this.removeArmy(army);
  }

  private assaultCastle(army: ArmyRecord, attacker: PlayerRecord): void {
    const defender = this.player(army.target.id);
    if (!defender) {
      this.startReturn(army, last(army.path));
      return;
    }
    // A fallen castle is off limits until its owner can act again (see `turnBackAssaults`).
    if (defender.routed) {
      this.addLog(
        attacker,
        `Die Burg von ${defender.name} ist bereits gefallen — deine Truppen kehren um.`,
      );
      this.startReturn(army, last(army.path));
      return;
    }
    defender.attackedAt = this.data.clock;
    const fortified = (defender.fortifiedUntil ?? 0) > this.data.clock;
    const multiplier = fortified ? FORTIFY_MULTIPLIER : 1;
    const attackerWins = army.troops > defender.homeTroops * multiplier;
    const losses = battleLosses(army.troops, defender.homeTroops, attackerWins);
    defender.homeTroops -= losses.defender;

    if (attackerWins) {
      const plunder = takeShare(defender.resources, CASTLE_PLUNDER_SHARE);
      army.troops = Math.max(1, army.troops - losses.attacker);
      addResources(army.cargo, plunder);
      // A chest out of nowhere, on top of the plunder; the defender's own chests stay put.
      army.chest = true;
      this.awardTrophy(attacker);
      this.addLog(
        attacker,
        `Sieg gegen ${defender.name}! ${losses.attacker} Verluste, Beute: ${formatResources(plunder)}, ` +
          'eine Truhe und eine Trophäe.',
      );
      this.addLog(
        defender,
        `${attacker.name} hat deine Burg gestürmt. ${losses.defender} Verteidiger gefallen, ` +
          `geplündert: ${formatResources(plunder)}.`,
      );
      this.addFeed(
        'battle',
        `${attacker.name} stürmt die Burg von ${defender.name} und erbeutet ` +
          `${formatResources(plunder)} und eine Truhe.`,
        army.id,
      );
      this.startReturn(army, last(army.path));
      this.rout(defender);
      this.turnBackAssaults(defender);
    } else {
      this.addLog(
        attacker,
        `Angriff auf ${defender.name} gescheitert: ${army.troops} Truppen verloren.`,
      );
      this.addLog(
        defender,
        `Angriff von ${attacker.name} (${army.troops} Truppen) abgewehrt. ${losses.defender} Verluste` +
          `${fortified ? ' (Bollwerk aktiv)' : ''}.`,
      );
      this.addFeed('battle', `${defender.name} wehrt einen Angriff von ${attacker.name} ab.`);
      this.removeArmy(army);
    }
  }

  /**
   * The castle of `defender` just fell: every other assault still marching on it turns home on
   * the spot. Until the owner can act again (`routed` lifted) no new one may be sent
   * (`destination`), and one that arrives anyway turns back without a fight (`assaultCastle`).
   */
  private turnBackAssaults(defender: PlayerRecord): void {
    for (const army of this.data.armies) {
      // Duo attacks keep their pact; they find the castle protected on arrival and go home.
      if (army.status !== 'outbound' || army.ownerId === defender.id || army.pactId) continue;
      if (army.target.kind !== 'castle' || army.target.id !== defender.id) continue;
      this.startReturn(army, this.armyPosition(army));
      const owner = this.player(army.ownerId);
      if (owner) {
        this.addLog(owner, `Die Burg von ${defender.name} ist gefallen — dein Angriff kehrt um.`);
      }
      this.addFeed(
        'march',
        `${this.armyLabel(army)} kehrt um: die Burg ist schon gefallen.`,
        army.id,
      );
    }
  }

  /**
   * The home castle fell: every army of the player heads home to the castle from where it stands
   * and drops its resource cargo (chests are kept) — those already on their way home too, re-timed
   * at normal speed. Every outpost is given up — it turns back into a ruin, its garrison marching
   * home empty-handed while the stock stays in the ruin. The player cannot act until all of these
   * are back (see `removeArmy`).
   */
  private rout(player: PlayerRecord): void {
    for (const army of this.data.armies) {
      // A duo attack goes on whatever happens at home: the pact binds.
      if (army.ownerId !== player.id || army.pactId) continue;
      army.baseId = null;
      army.cargo = emptyResources();
      this.startReturn(army, this.armyPosition(army));
    }
    let abandoned = 0;
    for (const outpost of this.data.outposts) {
      if (outpost.ownerId !== player.id) continue;
      if (outpost.troops > 0) {
        this.data.armies.push(
          this.fleeingArmy(player, outpost.position, outpost.troops, emptyResources()),
        );
      }
      outpost.ownerId = null;
      outpost.troops = 0;
      abandoned++;
    }
    player.routed = this.hasArmies(player.id);
    if (abandoned > 0) {
      this.addLog(player, `Deine Burg ist gefallen: ${abandoned} Stützpunkt(e) aufgegeben.`);
      this.addFeed(
        'outpost',
        `${player.name} gibt alle Stützpunkte auf — sie verfallen zu Ruinen.`,
      );
    }
    if (!player.routed) return;
    this.addLog(
      player,
      'Alle deine Züge ziehen sich zurück. Bis alle Truppen daheim sind, kannst du nichts tun.',
    );
    this.addFeed('battle', `${player.name} ruft alle Truppen zum Rückzug in die Burg.`);
  }

  /**
   * One-off for a running game: replaces every resource spot with a balanced layout
   * (`placeBalancedSpots`). Armies marching to a spot keep the time they have walked and carry on
   * from where they set out towards the new spot of the same resource nearest to that start;
   * gatherers move to the new spot nearest their old one and load there for the time they had
   * left; armies heading home are untouched.
   */
  private relayoutSpots(): void {
    const map = this.map!;
    const castles = this.data.players.flatMap((p) => (p.castle ? [p.castle] : []));
    const taken = [
      ...castles,
      ...this.data.outposts.map((o) => o.position),
      ...this.data.chests.map((c) => c.position),
    ];
    const random = createRandom(this.data.seed ^ 0x5b075);
    const anchors = [...castles, ...this.data.outposts.map((o) => o.position)];
    const old = new Map(this.data.spots.map((s) => [s.id, s.resource]));
    // Castles of a running game stay where they are: always search, even around a cramped one.
    // This runs during server start, so the first layout keeping every rule is taken.
    const layout = placeBalancedSpots(map, castles, innerLand(map), taken, anchors, random, {
      force: true,
      quick: true,
    });
    if (!layout.valid) {
      console.warn(`Spot re-layout: not every hard rule kept (cramped castles: ${layout.cramped})`);
    }
    this.data.spots = layout.spots.map((s) => ({ id: this.nextId('spot'), ...s }));

    for (const army of this.data.armies) {
      if (army.target.kind !== 'spot' || army.status === 'returning') continue;
      const resource = old.get(army.target.id);
      if (!resource) continue;
      // Where the march set out (a gatherer stands at its old spot).
      const from = army.path[0]!;
      const routes = this.data.spots
        .filter((s) => s.resource === resource)
        .flatMap((s) => {
          const path = findPath(map, from, s.position);
          return path ? [{ spot: s, path, length: pathLength(path) }] : [];
        })
        .sort((a, b) => a.length - b.length);
      const nearest = routes[0];
      if (!nearest) {
        this.startReturn(army, this.armyPosition(army));
        continue;
      }
      army.target = { kind: 'spot', id: nearest.spot.id };
      if (army.status === 'gathering') {
        // Loading goes on at the new spot; `arriveClock` (loading done) stays as it was.
        army.path = [nearest.spot.position];
        continue;
      }
      // Same start and departure, new destination: the hours walked so far count towards it.
      army.path = nearest.path;
      army.arriveClock = army.departClock + travelMs(nearest.length, map.width, army.forcedMarch);
    }
    this.data.spotLayout = SPOT_LAYOUT;
    for (const player of this.data.players) {
      this.addLog(player, 'Die Rohstoff-Vorkommen wurden neu verteilt.');
    }
    this.addFeed(
      'day',
      'Die Rohstoff-Vorkommen wurden neu verteilt — gleichmäßig über die ganze Karte.',
    );
    this.revision++;
    this.dirty = true;
  }

  /**
   * One-off for a running game: every army loading at a spot moves to the spot of the same
   * resource nearest (over land) to its owner's home castle, and loads there for the time it had
   * left (`arriveClock` stays). A moved army then carries its load to the home castle, whichever
   * base it came from, so outposts (lost or not) play no part. Armies already there stay put.
   */
  private moveGatherersToNearestSpot(): void {
    const map = this.map!;
    for (const army of this.data.armies) {
      if (army.status !== 'gathering' || army.target.kind !== 'spot') continue;
      const current = this.data.spots.find((s) => s.id === army.target.id);
      const owner = this.player(army.ownerId);
      const home = owner?.castle;
      if (!current || !owner || !home) continue;
      const nearest = this.data.spots
        .filter((s) => s.resource === current.resource)
        .map((spot) => {
          const path = findPath(map, home, spot.position);
          return { spot, length: path ? pathLength(path) : Infinity };
        })
        .sort((a, b) => a.length - b.length)[0];
      if (!nearest || nearest.spot.id === current.id || !Number.isFinite(nearest.length)) continue;
      army.target = { kind: 'spot', id: nearest.spot.id };
      army.path = [nearest.spot.position];
      army.baseId = null;
      this.addLog(
        owner,
        `Dein Zug (${army.troops}) lädt jetzt am nächsten ${SPOT_NAMES[current.resource]} weiter und bringt die Ladung zur Burg.`,
      );
    }
    this.data.gathererFix = GATHERER_FIX;
    this.revision++;
    this.dirty = true;
  }

  /**
   * On load: armies still heading for an outpost their owner has lost meanwhile (saved before
   * `recallFromLostOutpost` existed) turn home now. Only certain cases: returners, and transfers
   * recognisable by their cargo; an empty march on a foreign outpost may be a deliberate attack.
   */
  private recallFromLostOutposts(): void {
    const lost = (army: ArmyRecord, id: string | null | undefined) =>
      !!id && this.data.outposts.find((o) => o.id === id)?.ownerId !== army.ownerId;
    for (const army of this.data.armies) {
      const owner = this.player(army.ownerId);
      if (!owner) continue;
      const returner = army.status === 'returning' && lost(army, army.baseId);
      const transfer =
        army.status === 'outbound' &&
        army.target.kind === 'outpost' &&
        hasResources(army.cargo) &&
        lost(army, army.target.id);
      if (!returner && !transfer) continue;
      army.baseId = null;
      this.startReturn(army, this.armyPosition(army));
      this.addLog(
        owner,
        `Dein Zug (${army.troops}) kehrt zur Burg zurück — dein Stützpunkt ist gefallen.`,
      );
      this.dirty = true;
    }
  }

  /**
   * The outpost fell: the former owner's armies heading there turn for the home castle on the
   * spot (returners and transfers alike, cargo kept); armies elsewhere that left from it will
   * return home instead.
   */
  private recallFromLostOutpost(owner: PlayerRecord, outpostId: string, name: string): void {
    for (const army of this.data.armies) {
      if (army.ownerId !== owner.id) continue;
      const headingThere =
        (army.status === 'returning' && army.baseId === outpostId) ||
        (army.status === 'outbound' &&
          army.target.kind === 'outpost' &&
          army.target.id === outpostId);
      if (army.baseId === outpostId) army.baseId = null;
      if (!headingThere) continue;
      this.startReturn(army, this.armyPosition(army));
      this.addLog(owner, `Dein Zug (${army.troops}) kehrt zur Burg zurück — ${name} ist gefallen.`);
    }
  }

  private assaultOutpost(army: ArmyRecord, attacker: PlayerRecord, outpost: Outpost): void {
    const defender = outpost.ownerId ? this.player(outpost.ownerId) : undefined;
    const name = this.outpostName(outpost.id);
    outpost.attackedAt = this.data.clock;
    const attackerWins = army.troops > outpost.troops;
    const losses = battleLosses(army.troops, outpost.troops, attackerWins);
    outpost.troops -= losses.defender;

    if (!attackerWins) {
      this.addLog(attacker, `Angriff auf ${name} gescheitert: ${army.troops} Truppen verloren.`);
      if (defender) {
        this.addLog(
          defender,
          `${name} hält gegen ${attacker.name} stand. ${losses.defender} Verluste.`,
        );
      }
      this.addFeed('outpost', `${name} hält einem Angriff von ${attacker.name} stand.`);
      this.removeArmy(army);
      return;
    }

    const plunder = takeShare(outpost.resources, 1 - OUTPOST_PLUNDER_SHARE);
    // Whatever the defender keeps (nothing by default) leaves with the fleeing garrison.
    if (defender?.castle && outpost.troops > 0) {
      this.data.armies.push(this.fleeingArmy(defender, outpost.position, outpost.troops, plunder));
    }
    if (defender) this.recallFromLostOutpost(defender, outpost.id, name);
    // A trophy for taking it from someone; rebuilding an empty ruin is no victory.
    if (defender) this.awardTrophy(attacker);
    outpost.ownerId = attacker.id;
    outpost.troops = Math.max(1, army.troops - losses.attacker);
    addResources(outpost.resources, army.cargo);
    this.addLog(
      attacker,
      (defender ? `${name} erobert` : 'Ruine eingenommen und wiederaufgebaut') +
        (hasResources(outpost.resources) ? `, samt ${formatResources(outpost.resources)}` : '') +
        `. ${losses.attacker} Verluste.` +
        (defender ? ' Eine Trophäe ist dein.' : ''),
    );
    if (defender) {
      this.addLog(
        defender,
        `${attacker.name} hat deinen Stützpunkt erobert. ${losses.defender} Verteidiger gefallen.`,
      );
    }
    this.addFeed(
      'outpost',
      defender
        ? `${attacker.name} erobert den ${name}.`
        : `${attacker.name} baut eine Ruine wieder auf.`,
    );
    this.removeArmy(army);
  }

  private fleeingArmy(
    owner: PlayerRecord,
    from: Vec2,
    troops: number,
    cargo: Resources,
  ): ArmyRecord {
    const army: ArmyRecord = {
      id: this.nextId('army'),
      ownerId: owner.id,
      troops,
      status: 'returning',
      baseId: null,
      path: [from],
      target: { kind: 'castle', id: owner.id },
      departClock: this.data.clock,
      arriveClock: this.data.clock,
      fog: false,
      stealth: false,
      forcedMarch: false,
      cargo,
      chest: false,
    };
    this.startReturn(army, from);
    return army;
  }

  /** An ambush on a convoy heading home, at the meeting point planned when the raid was sent. */
  private raid(army: ArmyRecord, raider: PlayerRecord): void {
    const convoy = this.data.armies.find((a) => a.id === army.target.id);
    const victim = convoy && this.player(convoy.ownerId);
    if (
      !convoy ||
      !victim ||
      !isRaidable(convoy, victim.routed ?? false) ||
      distance(this.armyPosition(convoy), last(army.path)) > RAID_REACH_TILES
    ) {
      this.addLog(
        raider,
        victim?.routed
          ? 'Der Überfall ging ins Leere — der Zug zieht sich nach dem Fall seiner Burg zurück und ist unantastbar.'
          : 'Der Überfall ging ins Leere — der Zug ist entwischt.',
      );
      this.startReturn(army, last(army.path));
      return;
    }

    const attackerWins = army.troops > convoy.troops;
    const losses = battleLosses(army.troops, convoy.troops, attackerWins);
    // A chest bearer always keeps one troop, so the chest is never lost in an ambush.
    const convoyLoss = convoy.chest
      ? Math.min(losses.defender, convoy.troops - 1)
      : losses.defender;
    convoy.troops -= convoyLoss;
    if (attackerWins) {
      const plunder = takeShare(convoy.cargo, CONVOY_PLUNDER_SHARE);
      army.troops = Math.max(1, army.troops - losses.attacker);
      addResources(army.cargo, plunder);
      this.awardTrophy(raider);
      this.addLog(
        raider,
        `Überfall auf ${victim.name} geglückt! ${losses.attacker} Verluste, Beute: ${formatResources(plunder)} und eine Trophäe.`,
      );
      this.addLog(
        victim,
        `${raider.name} hat deinen Zug überfallen: ${convoyLoss} Verluste, ${formatResources(plunder)} verloren.`,
      );
      this.addFeed(
        'battle',
        `${raider.name} überfällt einen Zug von ${victim.name} und erbeutet ${formatResources(plunder)}.`,
        army.id,
      );
      this.startReturn(army, last(army.path));
      // Robbed of its load, the convoy marches on at normal speed: home, or on to its own base.
      // Robbed of its stone, a march to the trader has nothing left to trade and turns home.
      if (!hasResources(convoy.cargo)) {
        const position = this.armyPosition(convoy);
        if (convoy.status === 'returning' || convoy.trade) {
          if (convoy.trade && convoy.troops > 0) {
            this.addLog(victim, 'Ohne Stein lohnt der Händler nicht — dein Zug kehrt um.');
          }
          this.startReturn(convoy, position);
        } else {
          this.reroute(convoy, position, last(convoy.path));
        }
      }
    } else {
      this.addLog(
        raider,
        `Überfall auf ${victim.name} gescheitert: ${army.troops} Truppen verloren.`,
      );
      this.addLog(victim, `Dein Zug hat einen Überfall von ${raider.name} abgewehrt.`);
      this.addFeed(
        'battle',
        `Ein Zug von ${victim.name} wehrt einen Überfall von ${raider.name} ab.`,
      );
      this.removeArmy(army);
    }
    if (convoy.troops <= 0) this.removeArmy(convoy);
  }

  /**
   * End of the gameday (18:00), once per gameday: every owned outpost's whole stock leaves on the
   * night caravan, troop-free, and reaches the home castle at the next gameday start. Without a
   * night (`always`, or the server was down over it) `startGameday` sends it first.
   */
  private sendCaravans(now = Date.now()): void {
    if (this.data.phase !== 'running' || this.data.gameday === 0) return;
    if ((this.data.caravanDay ?? 0) >= this.data.gameday) return;
    this.data.caravanDay = this.data.gameday;
    // Arrives with the next gameday start: real time, as the game clock stands still at night.
    const arrivesAt = this.options.hours === 'always' ? now : nextGameTime(this.schedule, now);
    for (const player of this.data.players) {
      const load = emptyResources();
      const wagons: CaravanTrip['wagons'] = [];
      for (const outpost of this.data.outposts) {
        if (outpost.ownerId !== player.id) continue;
        if (hasResources(outpost.resources)) {
          wagons.push({ from: { ...outpost.position }, load: { ...outpost.resources } });
        }
        addResources(load, outpost.resources);
        outpost.resources = emptyResources();
      }
      if (!hasResources(load)) continue;
      player.caravan = player.caravan ?? emptyResources();
      addResources(player.caravan, load);
      player.caravanTrip = {
        wagons: [...(player.caravanTrip?.wagons ?? []), ...wagons],
        departedAt: now,
        arrivesAt,
      };
      this.addLog(
        player,
        `Feierabend: Die Karawane bringt ${formatResources(load)} aus deinen Stützpunkten heim — morgen früh liegt es in der Burg.`,
      );
    }
    this.revision++;
    this.dirty = true;
  }

  /**
   * A new gameday: the night caravans arrive in the home castles, then the daily income is paid
   * there — the activity, the Füllhorn and `OUTPOST_DAILY_INCOME` per owned outpost.
   */
  private startGameday(): void {
    this.sendCaravans();
    // An unanswered duo offer stays open the rest of its gameday and the whole next one.
    for (const pact of [...(this.data.pacts ?? [])]) {
      if (pact.status !== 'offered' || pact.gameday >= this.data.gameday) continue;
      this.dropPact(pact);
      const initiator = this.player(pact.initiatorId);
      if (initiator)
        this.addLog(initiator, 'Dein Duo-Angebot blieb unbeantwortet und ist verfallen.');
    }
    this.revision++;
    this.data.gameday++;
    for (const player of this.data.players) {
      const outposts = this.data.outposts.filter((o) => o.ownerId === player.id);
      const caravan = player.caravan ?? emptyResources();
      addResources(player.resources, caravan);
      player.caravan = emptyResources();
      delete player.caravanTrip;
      if (hasResources(caravan)) {
        this.addLog(player, `Die Karawane ist da: ${formatResources(caravan)} in der Burg.`);
      }

      player.activity = player.pendingActivity ?? player.activity;
      const income = emptyResources();
      const harvest = (player.harvestDays ?? 0) > 0 ? HARVEST_BONUS : 0;
      if (harvest) player.harvestDays! -= 1;
      const fromOutposts = outposts.length * OUTPOST_DAILY_INCOME;
      for (const r of RESOURCES) {
        income[r] =
          (r === player.activity ? DAILY_ACTIVITY_INCOME : DAILY_BASE_INCOME) +
          harvest +
          fromOutposts;
        player.resources[r] += income[r];
      }
      this.addLog(
        player,
        `Gameday ${this.data.gameday} beginnt: +${formatResources(income)}` +
          (outposts.length > 0
            ? ` (davon +${fromOutposts} je Rohstoff von ${outposts.length} Stützpunkt(en)).`
            : '.'),
      );
    }
    this.addFeed('day', `Spieltag ${this.data.gameday} beginnt.`);
    const chestCap = maxChestsOnMap(this.data.players.length);
    for (let i = 0; i < CHESTS_PER_GAMEDAY && this.data.chests.length < chestCap; i++) {
      this.spawnChest();
    }
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
    this.data.outposts = world.outposts;
    this.data.spotLayout = SPOT_LAYOUT;
    this.data.gathererFix = GATHERER_FIX;
    players.forEach((player, i) => {
      player.castle = world.castles[i]!;
      player.homeTroops = STARTING_TROOPS;
      player.resources = { ...STARTING_RESOURCES };
    });
    // The first gameday start (next tick) spawns the first chests.
    this.data.phase = 'running';
    this.addFeed('day', 'Das Spiel beginnt.');
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
      ...this.newPlayer(p.name, p.email),
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
    this.data.chests.push({
      id: this.nextId('chest'),
      position: farthestFrom(mainlandTiles(this.map), this.takenPositions(), Math.random),
      troopsNeeded: rollChestTroops(),
    });
    this.dirty = true;
  }

  /**
   * Admin: swaps two players' home castle positions, nothing else (troops, resources, outposts
   * stay with each player). Armies attacking either castle re-route from where they stand; armies
   * returning home move along with their castle, keeping distance and arrival time.
   */
  swapCastles(playerId: string, otherId: string): void {
    const a = this.player(playerId);
    const b = this.player(otherId);
    if (!a || !b || a === b) throw new RuleError('Unbekannter Spieler.');
    if (!a.castle || !b.castle) throw new RuleError('Beide brauchen eine Burg.');
    const moved = new Map([
      [a.id, { x: b.castle.x - a.castle.x, y: b.castle.y - a.castle.y }],
      [b.id, { x: a.castle.x - b.castle.x, y: a.castle.y - b.castle.y }],
    ]);
    [a.castle, b.castle] = [b.castle, a.castle];
    // Armies on their way home keep their distance and arrival time: the whole leg moves along
    // with the castle (clamped to the map), clocks stay as they are.
    const map = this.map!;
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0.5), max - 0.5);
    for (const army of this.data.armies) {
      const shift =
        army.status === 'returning' && army.target.kind === 'castle'
          ? moved.get(army.target.id)
          : undefined;
      if (!shift) continue;
      army.path = army.path.map((p) => ({
        x: clamp(p.x + shift.x, map.width),
        y: clamp(p.y + shift.y, map.height),
      }));
      const owner = this.player(army.ownerId);
      if (owner?.castle) army.path[army.path.length - 1] = { ...owner.castle };
    }
    this.rerouteToMoved(
      (army) =>
        army.status !== 'returning' &&
        army.target.kind === 'castle' &&
        (army.target.id === a.id || army.target.id === b.id),
    );
    this.addFeed('march', `Die Burgen von ${a.name} und ${b.name} tauschen die Plätze.`);
    for (const p of [a, b]) this.addLog(p, 'Deine Burg steht jetzt an einem neuen Ort.');
    this.revision++;
    this.dirty = true;
  }

  /** Re-plans an outbound army's march from `from` to `to` at its current pace. */
  private reroute(army: ArmyRecord, from: Vec2, to: Vec2): void {
    const map = this.map!;
    // A Seeweg march keeps sailing straight; only a redirect ends it (`endRouteCards`).
    army.path = army.sea ? [from, to] : (findPath(map, from, to) ?? [from, to]);
    army.departClock = this.data.clock;
    const owner = this.player(army.ownerId);
    const speed =
      (hasResources(army.cargo) ? LOADED_SPEED : 1) * (owner ? this.marchSpeed(owner) : 1);
    army.arriveClock =
      this.data.clock + travelMs(pathLength(army.path), map.width, army.forcedMarch, speed);
  }

  kick(playerId: string): void {
    for (const pact of (this.data.pacts ?? []).filter((p) => this.inPact(p, playerId))) {
      this.disbandPact(
        pact,
        'Ein Duo-Partner hat das Spiel verlassen — der Duo-Angriff ist abgebrochen.',
      );
    }
    this.data.players = this.data.players.filter((p) => p.id !== playerId);
    this.data.armies = this.data.armies.filter((a) => a.ownerId !== playerId);
    for (const outpost of this.data.outposts) {
      if (outpost.ownerId !== playerId) continue;
      outpost.ownerId = null;
      outpost.troops = 0;
    }
    this.dirty = true;
  }

  /** Admin: adds `amount` (may be negative, floored at 0) of one resource to the home castle. */
  grant(playerId: string, resource: ResourceType, amount: number): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    player.resources[resource] = Math.max(0, player.resources[resource] + amount);
    this.dirty = true;
  }

  grantTroops(playerId: string, amount: number): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    player.homeTroops = Math.max(0, player.homeTroops + amount);
    this.dirty = true;
  }

  setEmail(playerId: string, email: string): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    const holder = this.playerIdForEmail(email);
    if (holder && holder !== playerId) throw new RuleError('Diese E-Mail gehört schon jemandem.');
    player.email = email;
    this.dirty = true;
  }

  /** Admin: renames a player (same rules as at registration). */
  rename(playerId: string, rawName: string): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    player.name = this.cleanName(rawName, playerId);
    this.revision++;
    this.dirty = true;
  }

  grantTrophies(playerId: string, amount: number): void {
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    player.trophies = Math.max(0, (player.trophies ?? 0) + amount);
    this.dirty = true;
  }

  /**
   * Admin: a calendar day (YYYY-MM-DD, game time zone) without a gameday — the clock stands still
   * and no gameday starts, as on a weekend. `on` false lifts it.
   */
  setBreakDay(date: string, on: boolean): void {
    if (Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new RuleError('Ungültiges Datum.');
    const days = new Set(this.data.breakDays ?? []);
    if (on) days.add(date);
    else days.delete(date);
    this.data.breakDays = [...days].sort();
    this.revision++;
    this.dirty = true;
  }

  // ---- Views ----

  viewFor(playerId: string): GameView | null {
    const self = this.player(playerId);
    if (!self) return null;
    const clock = this.data.clock;
    // Bases a foreign Nebel march set out from show no troop count (`baseKey`).
    const fogged = new Set(
      this.data.armies
        .filter((a) => a.fog && a.ownerId !== playerId)
        .map((a) => baseKey(a.ownerId, a.baseId)),
    );
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
        trophies: p.trophies ?? 0,
        homeTroops: fogged.has(baseKey(p.id, null)) ? null : p.homeTroops,
        fortified: (p.fortifiedUntil ?? 0) > clock,
        barefoot: (p.barefootUntil ?? 0) > clock,
        routed: p.routed ?? false,
        attackedAt: p.attackedAt ?? null,
        online: this.online.has(p.id),
        caravanTrip: hasResources(p.caravan ?? emptyResources()) ? (p.caravanTrip ?? null) : null,
      })),
      spots: this.data.spots,
      outposts: this.data.outposts.map((o): OutpostView =>
        o.ownerId && fogged.has(baseKey(o.ownerId, o.id)) ? { ...o, troops: null } : o,
      ),
      chests: this.data.chests,
      armies: this.data.armies.map((a) => this.armyView(a, playerId)),
      feed: this.data.feed,
      self: {
        id: self.id,
        name: self.name,
        resources: self.resources,
        activity: self.activity,
        pendingActivity: self.pendingActivity,
        cards: self.cards,
        activeCard: self.activeCard ?? null,
        chests: self.chests ?? 0,
        fortifiedUntil: self.fortifiedUntil,
        harvestDays: self.harvestDays ?? 0,
        caravan: self.caravan ?? emptyResources(),
        pacts: (this.data.pacts ?? [])
          .filter((pact) => this.inPact(pact, self.id))
          .map(({ meet: _meet, ...pact }) => ({
            ...pact,
            initiatorSources: [...pact.initiatorSources],
          })),
        barefootUntil: (self.barefootUntil ?? 0) > clock ? self.barefootUntil! : null,
        victoryPointsToday: this.victoryPointsToday(self),
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
        email: p.email,
        online: this.online.has(p.id),
        victoryPoints: p.victoryPoints,
        trophies: p.trophies ?? 0,
        homeTroops: p.homeTroops,
        troopsAway:
          this.data.armies.filter((a) => a.ownerId === p.id).reduce((sum, a) => sum + a.troops, 0) +
          this.data.outposts
            .filter((o) => o.ownerId === p.id)
            .reduce((sum, o) => sum + o.troops, 0),
        resources: p.resources,
        cards: p.cards,
        pendingActivity: p.pendingActivity,
      })),
      armies: this.data.armies.length,
      chests: this.data.chests.length,
      outposts: this.data.outposts.length,
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
      breakDays: this.data.breakDays ?? [],
      breakToday:
        this.options.hours === 'weekdays' &&
        (this.data.breakDays ?? []).includes(dayKey(this.schedule, new Date())),
    };
  }

  private armyView(army: ArmyRecord, viewerId: string): ArmyView {
    const pact = army.pactId ? this.pact(army.pactId) : undefined;
    const member = pact !== undefined && this.inPact(pact, viewerId);
    const visible = army.ownerId === viewerId || member || !army.stealth;
    // A duo group's target stays secret to outsiders until the groups unite.
    const secret = pact !== undefined && pact.status !== 'united' && !member;
    const other = pact
      ? army.ownerId === pact.initiatorId
        ? pact.partnerId
        : pact.initiatorId
      : null;
    return {
      id: army.id,
      ownerId: army.ownerId,
      status: army.status,
      troops: army.ownerId === viewerId || !army.fog ? army.troops : null,
      position: this.armyPosition(army),
      from: army.path[0]!,
      to: visible ? last(army.path) : null,
      route: visible ? remainingPath(army.path, this.legFraction(army)) : null,
      target: visible && !secret ? army.target : null,
      departClock: army.departClock,
      // The arrival time would tell how far away the hidden target is.
      arriveClock: visible ? army.arriveClock : army.departClock,
      cargo: army.cargo,
      fog: army.fog,
      stealth: army.stealth,
      forcedMarch: army.forcedMarch,
      sea: army.sea ?? false,
      chest: army.chest ?? false,
      duoWith: pact && (member || pact.status === 'united') ? other : null,
    };
  }

  // ---- Helpers ----

  private emptyGame(seed: number, players: PlayerRecord[]): SavedGame {
    return {
      version: 2,
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
      outposts: [],
      chests: [],
      feed: [],
    };
  }

  /** Upgrades older saves: players get an email slot, armies land routes, the map outposts. */
  private migrate(saved: AnySavedGame): SavedGame {
    if (saved.version === 2) return this.normalize(saved);
    const data: SavedGame = {
      ...saved,
      version: 2,
      players: saved.players.map(({ gathered: _gathered, ...p }) => ({ ...p, email: null })),
      armies: saved.armies.map(({ from, to, loot, status, ...a }) => ({
        ...a,
        status: status === 'stationed' ? 'gathering' : status,
        baseId: null,
        path: status === 'stationed' ? [to] : [from, to],
        cargo: loot,
        ...(status === 'stationed'
          ? { departClock: saved.clock, arriveClock: saved.clock + GATHER_DURATION_MS }
          : {}),
      })),
      outposts: [],
      feed: [],
    };
    if (this.map && data.phase !== 'registration') {
      const players = data.players.length;
      const random = createRandom(data.seed ^ 0x0b5e);
      const land = mainlandTiles(this.map);
      const castles = data.players.flatMap((p) => (p.castle ? [p.castle] : []));
      data.outposts = placeOutposts(
        land,
        castles,
        this.takenPositions(data),
        outpostCount(players),
        random,
      );
    }
    this.dirty = true;
    return this.normalize(data);
  }

  /**
   * Fills fields added within save version 2: chest requirements; drops old outpost names and
   * lifts a rout whose troops are all home.
   */
  private normalize(data: SavedGame): SavedGame {
    for (const player of data.players) {
      if (player.routed && !data.armies.some((a) => a.ownerId === player.id)) {
        player.routed = false;
      }
    }
    data.pacts ??= [];
    data.chests = data.chests.map((c) => ({
      ...c,
      troopsNeeded: c.troopsNeeded ?? rollChestTroops(),
    }));
    data.outposts = data.outposts.map(({ name: _name, ...o }: Outpost & { name?: string }) => o);
    return data;
  }

  private takenPositions(data = this.data): Vec2[] {
    return [
      ...data.players.flatMap((p) => (p.castle ? [p.castle] : [])),
      ...data.spots.map((s) => s.position),
      ...data.outposts.map((o) => o.position),
      ...data.chests.map((c) => c.position),
    ];
  }

  private newPlayer(name: string, email: string | null): PlayerRecord {
    return {
      id: randomUUID(),
      name,
      email,
      token: randomBytes(24).toString('base64url'),
      castle: null,
      resources: emptyResources(),
      victoryPoints: 0,
      homeTroops: 0,
      activity: null,
      pendingActivity: null,
      cards: [],
      activeCard: null,
      chests: 0,
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
    this.addFeed('day', winner ? `Spielende — ${winner.name} gewinnt!` : 'Spielende.');
    this.dirty = true;
  }

  private player(id: string): PlayerRecord | undefined {
    return this.data.players.find((p) => p.id === id);
  }

  private requirePlaying(playerId: string): PlayerRecord {
    if (this.data.phase !== 'running') throw new RuleError('Das Spiel läuft gerade nicht.');
    const player = this.player(playerId);
    if (!player) throw new RuleError('Unbekannter Spieler.');
    if (player.routed) {
      throw new RuleError('Deine Burg ist gefallen — warte, bis alle Truppen heimgekehrt sind.');
    }
    return player;
  }

  /** The player's home castle (`id` null) or one of their outposts; null if not theirs. */
  private base(player: PlayerRecord, id: string | null): Base | null {
    if (id === null) {
      if (!player.castle) return null;
      return {
        id: null,
        position: player.castle,
        resources: player.resources,
        troops: player.homeTroops,
        setTroops: (troops) => (player.homeTroops = troops),
      };
    }
    const outpost = this.data.outposts.find((o) => o.id === id && o.ownerId === player.id);
    if (!outpost) return null;
    return {
      id: outpost.id,
      position: outpost.position,
      resources: outpost.resources,
      troops: outpost.troops,
      setTroops: (troops) => (outpost.troops = troops),
    };
  }

  /** Validates a march target and plans the route to it from `from`. */
  private destination(
    player: PlayerRecord,
    from: Vec2,
    target: ArmyTarget,
    forcedMarch: boolean,
    speed = 1,
    /** Seeweg: a straight line to the target, water or not. */
    straight = false,
  ): Destination {
    const map = this.map!;
    const now = this.data.clock;
    let to: Vec2 | null = null;
    let ownBase = false;
    switch (target.kind) {
      case 'castle': {
        const owner = this.player(target.id);
        if (owner && owner.id !== player.id && owner.routed) {
          throw new RuleError(
            `Die Burg von ${owner.name} ist gefallen — angreifbar erst, wenn alle Truppen dort heim sind.`,
          );
        }
        to = owner?.castle ?? null;
        ownBase = target.id === player.id;
        break;
      }
      case 'outpost': {
        const outpost = this.data.outposts.find((o) => o.id === target.id);
        to = outpost?.position ?? null;
        ownBase = outpost?.ownerId === player.id;
        break;
      }
      case 'spot':
        to = this.data.spots.find((s) => s.id === target.id)?.position ?? null;
        break;
      case 'chest':
        to = this.data.chests.find((c) => c.id === target.id)?.position ?? null;
        break;
      case 'army': {
        const convoy = this.data.armies.find((a) => a.id === target.id);
        if (!convoy) break;
        if (convoy.ownerId === player.id)
          throw new RuleError('Du kannst dich nicht selbst überfallen.');
        if (this.player(convoy.ownerId)?.routed) {
          throw new RuleError(
            'Dieser Zug zieht sich nach dem Fall seiner Burg zurück — unantastbar.',
          );
        }
        // Tarnung keeps a convoy safe as long as it stays on its route.
        if (convoy.stealth) {
          throw new RuleError('Ein getarnter Zug lässt sich nicht abfangen.');
        }
        if (!isRaidable(convoy, false)) {
          throw new RuleError('Überfallen lassen sich nur Züge, die Ressourcen tragen.');
        }
        const meeting = planIntercept(map, from, convoy, now, forcedMarch, speed);
        const path = meeting && findPath(map, from, meeting.position);
        if (!meeting || !path) {
          throw new RuleError('Zu weit weg — der Zug erreicht seine Burg vorher.');
        }
        const earliest = now + travelMs(pathLength(path), map.width, forcedMarch, speed);
        return { path, arriveClock: Math.max(meeting.clock, earliest), ownBase: false };
      }
    }
    if (!to) throw new RuleError('Ziel existiert nicht.');
    const path = straight ? [from, to] : findPath(map, from, to);
    if (!path) throw new RuleError('Dorthin führt kein Landweg.');
    return {
      path,
      arriveClock: now + travelMs(pathLength(path), map.width, forcedMarch, speed),
      ownBase,
    };
  }

  /** Rejects a march on a chest with too few troops to open it. */
  private checkChestTroops(target: ArmyTarget, troops: number): void {
    if (target.kind !== 'chest') return;
    const chest = this.data.chests.find((c) => c.id === target.id);
    if (chest && troops < chest.troopsNeeded) {
      throw new RuleError(`Diese Truhe braucht mindestens ${chest.troopsNeeded} Truppen.`);
    }
  }

  private legFraction(army: ArmyRecord): number {
    const span = army.arriveClock - army.departClock;
    if (army.status === 'gathering' || span <= 0) return army.status === 'gathering' ? 0 : 1;
    return Math.min(1, Math.max(0, (this.data.clock - army.departClock) / span));
  }

  private armyPosition(army: ArmyRecord): Vec2 {
    return pointAlong(army.path, this.legFraction(army));
  }

  /** Heads home to the army's base (or the castle, if that outpost is lost) over land. */
  private startReturn(army: ArmyRecord, from: Vec2): void {
    const owner = this.player(army.ownerId);
    if (!owner?.castle) {
      this.removeArmy(army);
      return;
    }
    const base = this.base(owner, army.baseId) ?? this.base(owner, null)!;
    army.baseId = base.id;
    army.status = 'returning';
    // Seeweg holds for the way home too, until the army is redirected (`endRouteCards`).
    army.path = army.sea
      ? [from, base.position]
      : (findPath(this.map!, from, base.position) ?? [from, base.position]);
    army.target = base.id ? { kind: 'outpost', id: base.id } : { kind: 'castle', id: owner.id };
    army.departClock = this.data.clock;
    // Resource cargo slows the march home; chests and empty hands do not.
    const speed = (hasResources(army.cargo) ? LOADED_SPEED : 1) * this.marchSpeed(owner);
    army.arriveClock =
      this.data.clock + travelMs(pathLength(army.path), this.map!.width, false, speed);
    delete army.trade;
    // Nebel, Tarnung and Seeweg hold on the way home too; Eilmarsch is for the way out only.
    army.forcedMarch = false;
  }

  /**
   * Nebel, Tarnung and Seeweg last only as long as the army keeps the route it set out on: the
   * player redirecting it (to a new target or another own base) ends them.
   */
  private endRouteCards(army: ArmyRecord): void {
    army.fog = false;
    army.stealth = false;
    army.sea = false;
  }

  private awardTrophy(player: PlayerRecord): void {
    player.trophies = (player.trophies ?? 0) + 1;
  }

  /** Victory points the player bought in the current gameday. */
  private victoryPointsToday(player: PlayerRecord): number {
    const bought = player.victoryPointsBought;
    return bought && bought.gameday === this.data.gameday ? bought.count : 0;
  }

  /** Pace of marches the player starts now: slowed while barefoot (Schuhe klauen). */
  private marchSpeed(player: PlayerRecord): number {
    return (player.barefootUntil ?? 0) > this.data.clock ? BAREFOOT_SPEED : 1;
  }

  /** Ends an army; the last one of a routed player home lifts the rout. */
  private removeArmy(army: ArmyRecord): void {
    this.data.armies = this.data.armies.filter((a) => a !== army);
    const owner = this.player(army.ownerId);
    if (owner) this.liftRout(owner);
  }

  /** Armies in the field that count as the player's: own ones and duo armies they are part of. */
  private hasArmies(playerId: string): boolean {
    return this.data.armies.some((a) => {
      if (a.ownerId === playerId) return true;
      const pact = a.pactId ? this.pact(a.pactId) : undefined;
      return pact !== undefined && this.inPact(pact, playerId);
    });
  }

  /** A routed player whose troops are all home can act again. */
  private liftRout(owner: PlayerRecord): void {
    if (!owner.routed || this.hasArmies(owner.id)) return;
    owner.routed = false;
    this.addLog(owner, 'Alle Truppen sind heimgekehrt — du kannst wieder handeln.');
    this.addFeed('march', `${owner.name} hat alle Truppen wieder beisammen.`);
  }

  private nextId(prefix: string): string {
    return `${prefix}-${this.data.nextId++}`;
  }

  private addLog(player: PlayerRecord, text: string): void {
    player.log.unshift({ at: Date.now(), text });
    if (player.log.length > MAX_LOG) player.log.length = MAX_LOG;
  }

  private addFeed(kind: FeedEntry['kind'], text: string, armyId?: string): void {
    this.data.feed.unshift({ at: Date.now(), kind, text, ...(armyId ? { armyId } : {}) });
    if (this.data.feed.length > MAX_FEED) this.data.feed.length = MAX_FEED;
  }

  /** "Name (120)", troop count hidden by fog. */
  private armyLabel(army: ArmyRecord): string {
    const owner = this.player(army.ownerId)?.name ?? 'Unbekannt';
    return `${owner} (${army.fog ? '?' : army.troops})`;
  }

  /** What a marching army is doing, for the ticker ("greift die Burg von X an"). */
  private marchPhrase(army: ArmyRecord): string {
    const { kind, id } = army.target;
    const name = (playerId: string | undefined) =>
      (playerId && this.player(playerId)?.name) ?? 'Unbekannt';
    switch (kind) {
      case 'castle':
        return id === army.ownerId
          ? 'verlegt in die eigene Burg'
          : `greift die Burg von ${name(id)} an`;
      case 'outpost': {
        const outpost = this.data.outposts.find((o) => o.id === id);
        if (outpost?.ownerId === army.ownerId) return 'verlegt in den eigenen Stützpunkt';
        return outpost?.ownerId
          ? `zieht gegen den ${this.outpostName(id)}`
          : 'zieht zu einer Ruine';
      }
      case 'spot': {
        const spot = this.data.spots.find((s) => s.id === id);
        return spot?.resource === 'trader'
          ? 'zieht zum Händler'
          : `zieht zum ${spot ? SPOT_NAMES[spot.resource] : 'Vorkommen'}`;
      }
      case 'chest':
        return 'zieht zu einer Truhe';
      case 'army':
        return `jagt einen Zug von ${name(this.data.armies.find((a) => a.id === id)?.ownerId)}`;
    }
  }

  private outpostName(id: string): string {
    const ownerId = this.data.outposts.find((o) => o.id === id)?.ownerId;
    return outpostName(ownerId ? (this.player(ownerId)?.name ?? 'Unbekannt') : null);
  }
}

/** Removes `share` of every resource from `from` (rounded down) and returns what was taken. */
function takeShare(from: Resources, share: number): Resources {
  const taken = emptyResources();
  for (const r of RESOURCES) {
    taken[r] = Math.floor(from[r] * share);
    from[r] -= taken[r];
  }
  return taken;
}

/** Identifies a base for fog hiding: the owner's castle (`baseId` null) or an outpost. */
function baseKey(ownerId: string, baseId: string | null): string {
  return baseId ?? `castle:${ownerId}`;
}

function addResources(into: Resources, add: Resources): void {
  for (const r of RESOURCES) into[r] += add[r];
}

/** Game duration as `h:mm h`, for log lines. */
function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`;
}

function formatResources(resources: Resources): string {
  const parts = RESOURCES.filter((r) => resources[r] > 0).map(
    (r) => `${resources[r]} ${RESOURCE_NAMES[r]}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'nichts';
}

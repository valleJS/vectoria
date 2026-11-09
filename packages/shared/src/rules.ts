/**
 * Game rules and balance constants. Shared so the client can show costs and travel times that
 * match what the server enforces. Tune numbers here, not in the apps.
 */

export const RESOURCES = ['wood', 'stone', 'gold'] as const;
export type ResourceType = (typeof RESOURCES)[number];
export type Resources = Record<ResourceType, number>;

export const RESOURCE_NAMES: Record<ResourceType, string> = {
  wood: 'Holz',
  stone: 'Stein',
  gold: 'Gold',
};

/** What a spot on the map offers: a resource to gather, or the trader. */
export const SPOT_KINDS = [...RESOURCES, 'trader'] as const;
export type SpotKind = (typeof SPOT_KINDS)[number];

export const SPOT_NAMES: Record<SpotKind, string> = {
  wood: 'Holz-Vorkommen',
  stone: 'Stein-Vorkommen',
  gold: 'Gold-Vorkommen',
  trader: 'Händler',
};

/**
 * The trader swaps `TRADE_INPUT` 1:1 for the `TRADE_OUTPUTS`, split as the sender chooses
 * (x stone → y gold + z wood, x = y + z). Instant on arrival, no loading time.
 */
export const TRADE_INPUT: ResourceType = 'stone';
export const TRADE_OUTPUTS: readonly ResourceType[] = ['gold', 'wood'];

export const HOUR_MS = 60 * 60 * 1000;
/** A gameday is 10:00–18:00, i.e. 8 hours of game clock. */
export const GAMEDAY_HOURS = 8;
export const GAMEDAY_MS = GAMEDAY_HOURS * HOUR_MS;

/** Daily payout: every resource +1, the chosen base activity pays this amount instead. */
export const DAILY_BASE_INCOME = 1;
export const DAILY_ACTIVITY_INCOME = 3;
/**
 * Each owned outpost adds this much of every resource to the home castle at each gameday start
 * (straight into the castle, not the outpost's own stock).
 */
export const OUTPOST_DAILY_INCOME = 1;

export const STARTING_TROOPS = 50;
export const STARTING_RESOURCES: Resources = { wood: 2, stone: 2, gold: 2 };

/** Troops come in batches; one batch costs this. */
export const TROOP_BATCH_SIZE = 10;
export const TROOP_BATCH_COST: Resources = { wood: 1, stone: 0, gold: 1 };
/** Price of the first victory point; each further one costs 1 more of one resource, in turn. */
export const VICTORY_POINT_BASE_COST: Resources = { wood: 1, stone: 2, gold: 1 };
export const VICTORY_POINT_STEP_ORDER: readonly ResourceType[] = ['stone', 'wood', 'gold'];
/** At most this many victory points can be bought per gameday (evening and night included). */
export const VICTORY_POINTS_PER_GAMEDAY = 3;
/**
 * Every `TROPHY_VP_INTERVAL`-th victory point needs trophies — a reputation, not a currency: they
 * are never spent. The 4th VP needs 1, the 8th 3, the 12th 6, … (1 + 2 + … + k for the 4k-th).
 * Trophies are won by victories over other players (raid, outpost, castle) and are public.
 */
export const TROPHY_VP_INTERVAL = 4;

/** Travelling the full map width (along land) takes this many gameday hours. */
export const CROSS_MAP_HOURS = 10;

/**
 * Gathering is a round trip: troops march to a spot, load for `GATHER_DURATION_MS`, then carry
 * this many resources per 100 troops back to the base they came from.
 */
export const GATHER_YIELD_PER_100_TROOPS = 10;
export const GATHER_DURATION_MS = HOUR_MS;

/**
 * Spot layout. Hard rules, per castle and its nearest spot of each kind: every spot at least
 * `SPOT_NEAR_HOURS` from every castle; exactly one kind lies `SPOT_FAR_HOURS`–`SPOT_MAX_HOURS`
 * away and it is one of `SPOT_FAR_KINDS` (wood or gold), the other three lie under
 * `SPOT_FAR_HOURS`. Across the map: spots keep `SPOT_GAP_HOURS` from each other
 * (`SPOT_SAME_GAP_HOURS` within one kind) and no land lies farther than `SPOT_HOLE_HOURS` from a
 * spot, castle or outpost. Soft goal: the four walks add up to about the same for every castle
 * (totals within `SPOT_BALANCE_TOLERANCE_HOURS`).
 */
export const SPOT_BALANCE_TOLERANCE_HOURS = 0.25;
export const SPOT_FAR_HOURS = 2;
export const SPOT_NEAR_HOURS = 1;
export const SPOT_MAX_HOURS = 4;
export const SPOT_FAR_KINDS = ['wood', 'gold'] as const satisfies readonly SpotKind[];
export const SPOT_GAP_HOURS = 1;
export const SPOT_SAME_GAP_HOURS = 2;
export const SPOT_HOLE_HOURS = 1.5;

/** Neutral outposts on the map: this many per player (at least `MIN_OUTPOSTS`). */
export const OUTPOSTS_PER_PLAYER = 0.75;
export const MIN_OUTPOSTS = 2;

/**
 * Combat. The attacker wins only with strictly more strength than the defence. Losses are shares
 * of the side's own troops, but nobody loses more troops than the other side brought.
 */
export const COMBAT = {
  /** Attacker wins: attacker loses this share, defender this share. */
  attackerWinsAttackerLoss: 0.25,
  attackerWinsDefenderLoss: 0.5,
  /** Defender wins: attacker loses this share (all), defender this share. */
  defenderWinsAttackerLoss: 1,
  defenderWinsDefenderLoss: 0.25,
} as const;
/** Share of each home-castle resource a victorious attacker carries away. */
export const CASTLE_PLUNDER_SHARE = 0.5;
/** Outposts and raided convoys lose everything they hold. */
export const OUTPOST_PLUNDER_SHARE = 1;
export const CONVOY_PLUNDER_SHARE = 1;

/** Chests spawning at each gameday start, up to `maxChestsOnMap` lying on the map. */
export const CHESTS_PER_GAMEDAY = 3;

/** Chests that may lie on the map at once: one per player, but at least one gameday's worth. */
export function maxChestsOnMap(players: number): number {
  return Math.max(CHESTS_PER_GAMEDAY, players);
}
/** Troops needed to open a chest: random in this range, in steps of `CHEST_TROOPS_STEP`. */
export const CHEST_TROOPS_MIN = 20;
export const CHEST_TROOPS_MAX = 100;
export const CHEST_TROOPS_STEP = 10;

/** Random troop requirement for a new chest. */
export function rollChestTroops(random: () => number = Math.random): number {
  const steps = (CHEST_TROOPS_MAX - CHEST_TROOPS_MIN) / CHEST_TROOPS_STEP;
  return CHEST_TROOPS_MIN + Math.floor(random() * (steps + 1)) * CHEST_TROOPS_STEP;
}

export const CARD_TYPES = [
  'fog',
  'stealth',
  'forcedMarch',
  'fortify',
  'sea',
  'harvest',
  'stealShoes',
  'relocate',
  'pickpocket',
  'bribe',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export interface CardInfo {
  name: string;
  description: string;
  /** Short lore line for the card profile. */
  flavor: string;
  /**
   * `march` cards, once activated, ride along with the next army sent; `instant` cards take
   * effect as soon as they are activated.
   */
  use: 'march' | 'instant';
  /**
   * Instant cards aimed at something: one of the player's outposts, another player, or another
   * player's army (picked on the map).
   */
  target?: 'ownOutpost' | 'player' | 'foreignArmy';
  /** Relative chance to be in a chest (1 = usual). */
  weight: number;
}

export const CARDS: Record<CardType, CardInfo> = {
  fog: {
    name: 'Nebel',
    description:
      'Andere sehen die Truppenstärke dieses Zuges und der Basis, aus der er aufbricht, nicht — bis er umgeleitet wird.',
    flavor: 'Wer zählt, was er nicht sieht?',
    use: 'march',
    weight: 1,
  },
  stealth: {
    name: 'Tarnung',
    description:
      'Andere sehen Ziel und Weg dieses Zuges nicht, hin und zurück — bis er umgeleitet wird.',
    flavor: 'Kein Späher weiß, wohin der Weg führt.',
    use: 'march',
    weight: 1,
  },
  forcedMarch: {
    name: 'Eilmarsch',
    description: 'Der Hinweg dauert nur halb so lang.',
    flavor: 'Schlaf ist für die Daheimgebliebenen.',
    use: 'march',
    weight: 1,
  },
  fortify: {
    name: 'Bollwerk',
    description: 'Deine Burg verteidigt einen Gameday lang mit +50 % Stärke.',
    flavor: 'Stein auf Stein, und kein Tor gibt nach.',
    use: 'instant',
    weight: 1,
  },
  sea: {
    name: 'Seeweg',
    description:
      'Hin- und Rückweg führen schnurgerade, auch übers Wasser — bis der Zug umgeleitet wird.',
    flavor: 'Wo andere ein Ufer sehen, sieht der Kapitän eine Abkürzung.',
    use: 'march',
    weight: 1,
  },
  harvest: {
    name: 'Füllhorn',
    description: 'Deine Burg bringt 3 Spieltage lang je +1 Holz, Stein und Gold zusätzlich.',
    flavor: 'Die Speicher laufen über, die Schreiber kommen kaum hinterher.',
    use: 'instant',
    weight: 1,
  },
  stealShoes: {
    name: 'Schuhe klauen',
    description:
      'Wähle jemanden: Dessen Züge, die einen Spieltag lang losziehen, laufen nur mit 75 % Tempo.',
    flavor: 'Barfuß marschiert es sich schlecht.',
    use: 'instant',
    target: 'player',
    weight: 1,
  },
  relocate: {
    name: 'Hofumzug',
    description: 'Deine Burg und einer deiner Stützpunkte tauschen die Plätze.',
    flavor: 'Der König packt die Krone ein, der Hauptmann seinen Spieß.',
    use: 'instant',
    target: 'ownOutpost',
    weight: 0.4,
  },
  pickpocket: {
    name: 'Langfinger',
    description:
      'Du siehst, wer wie viele Karten hat — nicht welche. Wähle jemanden und zieh blind eine davon.',
    flavor: 'Was in fremden Taschen steckt, weiß man erst hinterher.',
    use: 'instant',
    target: 'player',
    weight: 1,
  },
  bribe: {
    name: 'Bestechung',
    description:
      'Ein fremder Zug ohne Ladung, höchstens 1 h Marsch von einem deiner Züge entfernt, läuft zu dir über und stößt zu deinem Zug.',
    flavor: 'Jeder Söldner hat seinen Preis — meist einen kleinen.',
    use: 'instant',
    target: 'foreignArmy',
    weight: 0.6,
  },
};

/** A card drawn from a chest, weighted by `CardInfo.weight`. */
export function drawCard(random: () => number = Math.random): CardType {
  const total = CARD_TYPES.reduce((sum, c) => sum + CARDS[c].weight, 0);
  let roll = random() * total;
  for (const card of CARD_TYPES) {
    roll -= CARDS[card].weight;
    if (roll < 0) return card;
  }
  return CARD_TYPES[CARD_TYPES.length - 1]!;
}

/** Chance (0..1) to draw `card` from a chest. */
export function cardChance(card: CardType): number {
  return CARDS[card].weight / CARD_TYPES.reduce((sum, c) => sum + CARDS[c].weight, 0);
}

/** Füllhorn: extra income of every resource at each of the next gameday starts. */
export const HARVEST_BONUS = 1;
export const HARVEST_GAMEDAYS = 3;

/** Schuhe klauen: marches the victim starts within the duration go at this pace. */
export const BAREFOOT_SPEED = 0.75;
export const BAREFOOT_DURATION_MS = GAMEDAY_MS;

/**
 * Bestechung: a foreign army can be bribed while one of the player's own armies is within this
 * many marching hours of it (straight line, at normal pace), so the reach grows with the map.
 */
export const BRIBE_RANGE_HOURS = 1;

/** Bestechung's reach in tiles on a map `mapWidth` tiles wide (see `travelMs`). */
export function bribeRangeTiles(mapWidth: number): number {
  return (mapWidth * BRIBE_RANGE_HOURS) / CROSS_MAP_HOURS;
}

export const FORTIFY_MULTIPLIER = 1.5;
export const FORTIFY_DURATION_MS = GAMEDAY_MS;

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, gold: 0 };
}

export function hasResources(resources: Resources): boolean {
  return RESOURCES.some((r) => resources[r] > 0);
}

/** Troops lost per side for a battle of `attack` troops against `defenders` troops. */
export function battleLosses(
  attack: number,
  defenders: number,
  attackerWins: boolean,
): { attacker: number; defender: number } {
  const [a, d] = attackerWins
    ? [COMBAT.attackerWinsAttackerLoss, COMBAT.attackerWinsDefenderLoss]
    : [COMBAT.defenderWinsAttackerLoss, COMBAT.defenderWinsDefenderLoss];
  return {
    attacker: Math.min(attack, Math.ceil(attack * a), attackerWins ? defenders : attack),
    defender: Math.min(defenders, Math.ceil(defenders * d), attack),
  };
}

/** Resources a gathering party of `troops` brings back. */
export function gatherYield(troops: number): number {
  return Math.floor((troops * GATHER_YIELD_PER_100_TROOPS) / 100);
}

/**
 * Price of the next victory point for a player who owns `owned`: the base cost plus `owned`
 * single steps spread over `VICTORY_POINT_STEP_ORDER` (2nd VP +1 stone, 3rd +1 wood, 4th +1 gold, …).
 */
export function victoryPointCost(owned: number): Resources {
  const cost = { ...VICTORY_POINT_BASE_COST };
  const steps = VICTORY_POINT_STEP_ORDER.length;
  VICTORY_POINT_STEP_ORDER.forEach((r, i) => {
    cost[r] += Math.floor((owned + steps - 1 - i) / steps);
  });
  return cost;
}

/** Total price of the next `count` victory points for a player who owns `owned`. */
export function victoryPointsCost(owned: number, count: number): Resources {
  const total: Resources = { wood: 0, stone: 0, gold: 0 };
  for (let i = 0; i < count; i++) {
    const cost = victoryPointCost(owned + i);
    for (const r of RESOURCES) total[r] += cost[r];
  }
  return total;
}

/**
 * Trophies a player who owns `owned` VP must have to buy the next one (0 for most): the 4k-th
 * needs 1 + 2 + … + k. Trophies are not spent.
 */
export function victoryPointTrophiesNeeded(owned: number): number {
  const nth = owned + 1;
  if (nth % TROPHY_VP_INTERVAL !== 0) return 0;
  const k = nth / TROPHY_VP_INTERVAL;
  return (k * (k + 1)) / 2;
}

/** Trophies needed to buy the next `count` victory points at once (the highest threshold). */
export function victoryPointsTrophiesNeeded(owned: number, count: number): number {
  let needed = 0;
  for (let i = 0; i < count; i++) needed = Math.max(needed, victoryPointTrophiesNeeded(owned + i));
  return needed;
}

export function canAfford(have: Resources, cost: Resources, times = 1): boolean {
  return RESOURCES.every((r) => have[r] >= cost[r] * times);
}

/**
 * Test branch: the map is this much wider than on main, so castles, outposts and deposits stand
 * further apart on screen (pieces are sized per tile). Travel times follow the map width
 * (`travelMs`), so walking hours stay the same.
 */
export const MAP_SPREAD = 1.5;

/** Map side length in tiles for a given number of registered players. */
export function mapSizeForPlayers(players: number): number {
  const base = Math.min(96, Math.max(24, 16 + 8 * Math.sqrt(Math.max(1, players))));
  return Math.round(base * MAP_SPREAD);
}

/** Speed of an army carrying resources (home from a spot, or between own bases), relative to normal. */
export const LOADED_SPEED = 0.75;

/**
 * Game-clock milliseconds to travel `distance` tiles on a map `mapWidth` tiles wide, at `speed`
 * times the normal pace (forced march: 2, loaded convoy: `LOADED_SPEED`).
 */
export function travelMs(
  distance: number,
  mapWidth: number,
  forcedMarch = false,
  speed = 1,
): number {
  const ms = (distance / mapWidth) * CROSS_MAP_HOURS * HOUR_MS;
  return Math.round(ms / ((forcedMarch ? 2 : 1) * speed));
}

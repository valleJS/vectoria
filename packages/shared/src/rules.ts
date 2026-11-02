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

export const HOUR_MS = 60 * 60 * 1000;
/** A gameday is 10:00–18:00, i.e. 8 hours of game clock. */
export const GAMEDAY_HOURS = 8;
export const GAMEDAY_MS = GAMEDAY_HOURS * HOUR_MS;

/** Daily payout: every resource +1, the chosen base activity pays this amount instead. */
export const DAILY_BASE_INCOME = 1;
export const DAILY_ACTIVITY_INCOME = 3;

export const STARTING_TROOPS = 50;
export const STARTING_RESOURCES: Resources = { wood: 2, stone: 2, gold: 2 };

/** Troops come in batches; one batch costs this. */
export const TROOP_BATCH_SIZE = 10;
export const TROOP_BATCH_COST: Resources = { wood: 1, stone: 0, gold: 1 };
export const VICTORY_POINT_COST: Resources = { wood: 1, stone: 2, gold: 1 };

/** Travelling the full map width (along land) takes this many gameday hours. */
export const CROSS_MAP_HOURS = 10;

/**
 * Gathering is a round trip: troops march to a spot, load for `GATHER_DURATION_MS`, then carry
 * this many resources per 100 troops back to the base they came from.
 */
export const GATHER_YIELD_PER_100_TROOPS = 10;
export const GATHER_DURATION_MS = HOUR_MS;

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

export const CARD_TYPES = ['fog', 'stealth', 'forcedMarch', 'fortify'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export interface CardInfo {
  name: string;
  description: string;
  /** `march` cards are attached when sending an army; `instant` cards are played on their own. */
  use: 'march' | 'instant';
}

export const CARDS: Record<CardType, CardInfo> = {
  fog: {
    name: 'Nebel',
    description: 'Andere sehen die Truppenstärke dieses Zuges nicht.',
    use: 'march',
  },
  stealth: {
    name: 'Tarnung',
    description: 'Andere sehen das Ziel dieses Zuges nicht.',
    use: 'march',
  },
  forcedMarch: {
    name: 'Eilmarsch',
    description: 'Der Hinweg dauert nur halb so lang.',
    use: 'march',
  },
  fortify: {
    name: 'Bollwerk',
    description: 'Deine Burg verteidigt einen Gameday lang mit +50 % Stärke.',
    use: 'instant',
  },
};

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

export function canAfford(have: Resources, cost: Resources, times = 1): boolean {
  return RESOURCES.every((r) => have[r] >= cost[r] * times);
}

/** Map side length in tiles for a given number of registered players. */
export function mapSizeForPlayers(players: number): number {
  return Math.min(96, Math.max(24, Math.round(16 + 8 * Math.sqrt(Math.max(1, players)))));
}

/** Game-clock milliseconds to travel `distance` tiles on a map `mapWidth` tiles wide. */
export function travelMs(distance: number, mapWidth: number, forcedMarch = false): number {
  const ms = (distance / mapWidth) * CROSS_MAP_HOURS * HOUR_MS;
  return Math.round(forcedMarch ? ms / 2 : ms);
}

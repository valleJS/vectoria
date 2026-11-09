import { emptyResources, type CardType, type Resources } from './rules';

/**
 * Kinds of attack the stats count: `raid` = ambush on a convoy (Überfall), `outpost` = on another
 * player's outpost, `ruin` = taking an empty ruin, `castle` = on a home castle, `duo` = duo attack.
 */
export const ATTACK_KINDS = ['raid', 'outpost', 'ruin', 'castle', 'duo'] as const;
export type AttackKind = (typeof ATTACK_KINDS)[number];

/** Started = ordered (sent or redirected there); executed = the battle took place; won = of those. */
export interface AttackCounts {
  started: number;
  executed: number;
  won: number;
}

/** What was attacked of the player: home castle, an outpost, a convoy (raided). */
export const DEFENSE_KINDS = ['castle', 'outpost', 'convoy'] as const;
export type DefenseKind = (typeof DEFENSE_KINDS)[number];

export interface DefenseCounts {
  attacked: number;
  held: number;
}

/** Per-player statistics for the current game round; shown in the admin panel. */
export interface PlayerStats {
  /** Real milliseconds with at least one open connection. */
  onlineMs: number;
  /** Of `onlineMs`, the part inside the gameday hours (clock running). */
  onlineInHoursMs: number;
  /** Online milliseconds per calendar day (YYYY-MM-DD, game time zone), recent days only. */
  onlineByDay: Record<string, number>;
  /** Times the player came online (first open connection). */
  sessions: number;
  /** Real time the player was last connected; null if never. */
  lastSeenAt: number | null;
  /** Commands sent (march, buy, card, duo …), accepted or not. */
  commands: number;
  /** Real time of the last command; null if none. */
  lastActionAt: number | null;
  attacks: Record<AttackKind, AttackCounts>;
  defenses: Record<DefenseKind, DefenseCounts>;
  /** Duo attack offers sent and received (accepted ones count as `attacks.duo.started`). */
  duoOffers: { sent: number; received: number };
  /** Gathering marches sent to a resource spot, and those that came back loaded. */
  gathers: { started: number; completed: number };
  /** Resources loaded at spots. */
  gathered: Resources;
  /** Resources taken in won raids and assaults. */
  plunder: Resources;
  /** Swaps at the trader. */
  trades: number;
  chests: { recovered: number; opened: number };
  /** Cards played, by type. */
  cardsPlayed: Partial<Record<CardType, number>>;
  troopsBought: number;
  victoryPointsBought: number;
  /** Own troops fallen in battle, and enemy troops defeated. */
  troopsLost: number;
  troopsKilled: number;
}

/** Days `onlineByDay` keeps; older ones are dropped. */
export const ONLINE_DAYS_KEPT = 60;

export function emptyPlayerStats(): PlayerStats {
  const counts = () => ({ started: 0, executed: 0, won: 0 });
  const defense = () => ({ attacked: 0, held: 0 });
  return {
    onlineMs: 0,
    onlineInHoursMs: 0,
    onlineByDay: {},
    sessions: 0,
    lastSeenAt: null,
    commands: 0,
    lastActionAt: null,
    attacks: {
      raid: counts(),
      outpost: counts(),
      ruin: counts(),
      castle: counts(),
      duo: counts(),
    },
    defenses: { castle: defense(), outpost: defense(), convoy: defense() },
    duoOffers: { sent: 0, received: 0 },
    gathers: { started: 0, completed: 0 },
    gathered: emptyResources(),
    plunder: emptyResources(),
    trades: 0,
    chests: { recovered: 0, opened: 0 },
    cardsPlayed: {},
    troopsBought: 0,
    victoryPointsBought: 0,
    troopsLost: 0,
    troopsKilled: 0,
  };
}

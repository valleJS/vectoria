import {
  BAREFOOT_SPEED,
  findPath,
  pathLength,
  planIntercept,
  travelMs,
  type ArmyTarget,
  type ArmyView,
  type GameView,
  type MapData,
  type Vec2,
} from '@vectoria/shared';
import type { BaseInfo } from './format';

// March planning shared by the send forms (side panel) and the trade menu: travel time, the
// preselected base, the barefoot penalty.

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Convoy movement as seen now: the remaining route, walked until its arrival clock. */
export function trackOf(view: GameView, army: ArmyView) {
  return army.route
    ? { path: army.route, departClock: view.clock.clock, arriveClock: army.arriveClock }
    : null;
}

/** Travel time from `from` to the target, or null if no land route (or raid too late). */
export function eta(
  map: MapData,
  view: GameView,
  from: Vec2,
  target: ArmyTarget,
  position: Vec2,
  forcedMarch: boolean,
  /** Seeweg: straight over water, not along land. */
  sea = false,
): number | null {
  // Marches started barefoot (Schuhe klauen) go slower, as on the server.
  const speed = barefoot(view) ? BAREFOOT_SPEED : 1;
  if (target.kind === 'army') {
    const convoy = view.armies.find((a) => a.id === target.id);
    const track = convoy && trackOf(view, convoy);
    const meeting = track && planIntercept(map, from, track, view.clock.clock, forcedMarch, speed);
    return meeting ? meeting.clock - view.clock.clock : null;
  }
  const path = sea ? [from, position] : findPath(map, from, position);
  return path ? travelMs(pathLength(path), map.width, forcedMarch, speed) : null;
}

export function barefoot(view: GameView): boolean {
  return (view.self.barefootUntil ?? 0) > view.clock.clock;
}

/** The base preselected for a march to `position`: the nearest one that has troops. */
export function nearestBase(bases: BaseInfo[], position: Vec2): BaseInfo | undefined {
  return [...bases].sort(
    (a, b) =>
      Number(b.troops > 0) - Number(a.troops > 0) ||
      distance(a.position, position) - distance(b.position, position),
  )[0];
}

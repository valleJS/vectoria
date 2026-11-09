import {
  bribeRangeTiles,
  isBribable,
  mapDistance,
  type ArmyView,
  type GameView,
  type MapData,
} from '@vectoria/shared';

// Bestechung as the client sees it: which foreign armies are in reach of an own army right now.
// The server decides on activation (with exact positions); this only drives the map marks and
// the button.

type MapSize = Pick<MapData, 'width' | 'height'>;

/** Own armies that can bribe: not in a duo and not themselves on the way to join one. */
export function bribeHosts(view: GameView): ArmyView[] {
  return view.armies.filter(
    (a) => a.ownerId === view.self.id && a.duoWith === null && a.joining === null,
  );
}

/** The own army a bribe of `army` would join (the nearest in reach), if any. */
export function bribeHostFor(view: GameView, map: MapSize, army: ArmyView): ArmyView | null {
  if (army.ownerId === view.self.id) return null;
  const routed = view.players.find((p) => p.id === army.ownerId)?.routed ?? false;
  if (!isBribable(army, army.duoWith !== null, routed)) return null;
  const reach = bribeRangeTiles(map.width);
  return (
    bribeHosts(view)
      .map((host) => ({ host, d: mapDistance(map, host.position, army.position) }))
      .filter(({ d }) => d <= reach)
      .sort((x, y) => x.d - y.d)[0]?.host ?? null
  );
}

/** Foreign armies a Bestechung could win over right now. */
export function bribableArmies(view: GameView, map: MapSize): ArmyView[] {
  return view.armies.filter((a) => bribeHostFor(view, map, a) !== null);
}

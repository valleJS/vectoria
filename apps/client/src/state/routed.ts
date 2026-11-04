import { useGameStore } from './store';

/** True while the own home castle has fallen and troops are still retreating home. */
export function useRouted(): boolean {
  return useGameStore(
    (s) => s.view?.players.find((p) => p.id === s.view?.self.id)?.routed ?? false,
  );
}

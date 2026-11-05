import { useGameStore } from '../state/store';
import { SpotIcon } from './icons';
import { TRADER_TEXT, TradeForm } from './SelectionPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The trade menu in the middle of the screen: opens when the trader is selected on the map (or
 * from its side panel), closes on sending a trade march or on dismiss.
 */
export function TraderMenu() {
  const open = useGameStore((s) => s.traderMenu);
  const view = useGameStore((s) => s.view);
  const selection = useGameStore((s) => s.selection);
  const setTraderMenu = useGameStore((s) => s.setTraderMenu);
  const spot =
    selection?.kind === 'spot' && view
      ? view.spots.find((s) => s.id === selection.id && s.resource === 'trader')
      : undefined;
  if (!view || !spot) return null;
  return (
    <Dialog open={open} onOpenChange={setTraderMenu}>
      <DialogContent className="max-h-[min(40rem,90dvh)] max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3">
          <SpotIcon kind="trader" size={56} />
          <div>
            <DialogTitle>Händler</DialogTitle>
            <DialogDescription>{TRADER_TEXT}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          <TradeForm view={view} spotId={spot.id} onSent={() => setTraderMenu(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

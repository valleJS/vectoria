import { useEffect } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { gameSocket } from './net/socket';
import { Hud } from './ui/Hud';

export function App() {
  useEffect(() => {
    gameSocket.connect();
    return () => gameSocket.disconnect();
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <GameCanvas />
      <Hud />
    </div>
  );
}

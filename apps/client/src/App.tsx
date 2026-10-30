import { useEffect } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { gameSocket } from './net/socket';
import { useGameStore } from './state/store';
import { AdminPanel } from './ui/AdminPanel';
import { Hud } from './ui/Hud';
import { JoinScreen, Lobby } from './ui/JoinScreen';

const isAdminRoute = new URLSearchParams(window.location.search).has('admin');

function PlayerApp() {
  const token = useGameStore((s) => s.token);
  const phase = useGameStore((s) => s.view?.phase);
  const hasMap = useGameStore((s) => s.map !== null);

  useEffect(() => {
    if (!token) return;
    gameSocket.connect(token);
    return () => gameSocket.disconnect();
  }, [token]);

  if (!token) return <JoinScreen />;
  if (!phase || phase === 'registration' || !hasMap) return <Lobby />;
  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <GameCanvas />
      <Hud />
    </div>
  );
}

export function App() {
  return isAdminRoute ? <AdminPanel /> : <PlayerApp />;
}

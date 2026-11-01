import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { gameSocket } from './net/socket';
import { useGameStore } from './state/store';
import { AdminPanel } from './ui/AdminPanel';
import { Hud } from './ui/Hud';
import { takeLoginLink } from './net/loginLink';
import { JoinScreen, Lobby } from './ui/JoinScreen';

const isAdminRoute = new URLSearchParams(window.location.search).has('admin');
const loginLink = isAdminRoute ? null : takeLoginLink();

function PlayerApp() {
  const token = useGameStore((s) => s.token);
  const phase = useGameStore((s) => s.view?.phase);
  const hasMap = useGameStore((s) => s.map !== null);
  // A login link from the email wins over a stored session until it has been tried.
  const [link, setLink] = useState(loginLink);

  useEffect(() => {
    if (!token) return;
    gameSocket.connect(token);
    return () => gameSocket.disconnect();
  }, [token]);

  if (!token || link) return <JoinScreen link={link} onDone={() => setLink(null)} />;
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

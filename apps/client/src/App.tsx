import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GameCanvas } from './game/GameCanvas';
import { isNightRest } from './game/night';
import { gameSocket } from './net/socket';
import { useGameStore } from './state/store';
import { AdminPanel } from './ui/AdminPanel';
import { DesignSheet } from './ui/DesignSheet';
import { Hud } from './ui/Hud';
import { takeLoginLink } from './net/loginLink';
import { JoinScreen, Lobby } from './ui/JoinScreen';

const params = new URLSearchParams(window.location.search);
const isAdminRoute = params.has('admin');
const isDesignRoute = params.has('design');
const loginLink = isAdminRoute ? null : takeLoginLink();

/** The tab icon follows the game's day and night: parchment tile by day, dark gold by night. */
function setFavicon(night: boolean) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (link) link.href = night ? '/favicon-night.svg' : '/favicon.svg';
}

function PlayerApp() {
  const token = useGameStore((s) => s.token);
  const phase = useGameStore((s) => s.view?.phase);
  const hasMap = useGameStore((s) => s.map !== null);
  const night = useGameStore((s) => s.view !== null && isNightRest(s.view));
  // A login link from the email wins over a stored session until it has been tried.
  const [link, setLink] = useState(loginLink);

  useEffect(() => {
    if (!token) return;
    gameSocket.connect(token);
    return () => gameSocket.disconnect();
  }, [token]);

  // On <html>, so portalled dialogs and tooltips dim along with the HUD (index.css).
  useEffect(() => {
    document.documentElement.toggleAttribute('data-night', night);
    setFavicon(night);
    return () => {
      document.documentElement.removeAttribute('data-night');
      setFavicon(false);
    };
  }, [night]);

  if (!token || link) return <JoinScreen link={link} onDone={() => setLink(null)} />;
  if (!phase || phase === 'registration' || !hasMap) return <Lobby />;
  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <GameCanvas />
      <div data-hud className="pointer-events-none absolute inset-0">
        <Hud />
      </div>
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      {isDesignRoute ? <DesignSheet /> : isAdminRoute ? <AdminPanel /> : <PlayerApp />}
    </TooltipProvider>
  );
}

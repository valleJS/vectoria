import { createServer } from 'node:http';
import { config } from './config';
import { GameLoop } from './game/GameLoop';
import { GameState } from './game/GameState';
import { Persistence } from './game/persistence';
import { log } from './logger';
import { createMailer } from './mail';
import { EmailAuth } from './net/auth';
import { GameServer } from './net/GameServer';
import { handleHttp } from './net/http';
import { connectServices } from './services';

const newSeed = () => Math.floor(Math.random() * 2 ** 31) + 1;

async function main(): Promise<void> {
  const services = await connectServices(config);
  const persistence = new Persistence(config.dataFile);
  const state = new GameState({ seed: config.mapSeed, ...config.game }, await persistence.load());
  const auth = new EmailAuth(state, createMailer(config), config.publicUrl);

  const http = createServer((req, res) => {
    void handleHttp(
      {
        state,
        auth,
        adminToken: config.adminToken,
        connectionCount: () => gameServer.connectionCount,
        onChange: () => gameServer.broadcastState(),
        newSeed,
      },
      req,
      res,
    );
  });

  const gameServer = new GameServer(http, state, {
    tickRate: config.tickRate,
    allowedOrigins: config.allowedOrigins,
  });

  const loop = new GameLoop(config.tickRate, (dtMs) => {
    state.update(dtMs);
    gameServer.broadcastState();
  });

  await new Promise<void>((resolve) => http.listen(config.port, config.host, resolve));
  loop.start();
  persistence.start(state);
  log.info(
    `Listening on http://${config.host}:${config.port} (ws /ws, ${config.tickRate} ticks/s, ` +
      `hours ${config.game.hours}, time scale ${config.game.timeScale}, phase ${state.phase})`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, shutting down`);
    loop.stop();
    await persistence.stop(state);
    await gameServer.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await services.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  log.error('Fatal startup error', error);
  process.exit(1);
});

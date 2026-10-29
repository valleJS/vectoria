import { createServer } from 'node:http';
import { config } from './config';
import { GameLoop } from './game/GameLoop';
import { GameState } from './game/GameState';
import { log } from './logger';
import { GameServer } from './net/GameServer';
import { connectServices } from './services';

async function main(): Promise<void> {
  const services = await connectServices(config);
  const state = new GameState(config.map);

  const http = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: 'ok', tick: state.tick, connections: gameServer.connectionCount }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const gameServer = new GameServer(http, state, {
    tickRate: config.tickRate,
    allowedOrigins: config.allowedOrigins,
  });

  const loop = new GameLoop(config.tickRate, (dtMs) => {
    state.update(dtMs / 1000);
    gameServer.broadcast({
      type: 'snapshot',
      tick: state.tick,
      entities: state.snapshotEntities(),
    });
  });

  await new Promise<void>((resolve) => http.listen(config.port, config.host, resolve));
  loop.start();
  log.info(
    `Listening on http://${config.host}:${config.port} (ws path /ws, ${config.tickRate} ticks/s, map seed ${config.map.seed})`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, shutting down`);
    loop.stop();
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

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseAdminAction, type AdminAction, type ApiError } from '@vectoria/shared';
import { RuleError, type GameState } from '../game/GameState';
import { log } from '../logger';
import type { EmailAuth } from './auth';

const MAX_BODY_BYTES = 4 * 1024;

export interface HttpContext {
  state: GameState;
  auth: EmailAuth;
  adminToken: string;
  connectionCount: () => number;
  /** Called after any admin action so clients get the new state (and map) right away. */
  onChange: () => void;
  newSeed: () => number;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RuleError('Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RuleError('Invalid JSON');
  }
}

function isAdmin(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.replace(/^Bearer /, ''));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function runAdminAction(ctx: HttpContext, action: AdminAction): void {
  const { state } = ctx;
  switch (action.action) {
    case 'start':
      return state.start();
    case 'end':
      return state.end();
    case 'reset':
      return state.reset(ctx.newSeed());
    case 'pause':
      return state.setPaused(true);
    case 'resume':
      return state.setPaused(false);
    case 'advanceClock':
      return state.advanceClock(action.hours);
    case 'newGameday':
      return state.forceGameday();
    case 'spawnChest':
      return state.spawnChest();
    case 'kick':
      return state.kick(action.playerId);
    case 'setEmail':
      return state.setEmail(action.playerId, action.email);
    case 'grant':
      return state.grant(action.playerId, action.resource, action.amount);
  }
}

/** Routes for `/healthz` and `/api/*`; anything else is a 404. */
export async function handleHttp(
  ctx: HttpContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const route = `${req.method} ${req.url?.split('?')[0]}`;
  try {
    switch (route) {
      case 'GET /healthz':
        return json(res, 200, {
          status: 'ok',
          tick: ctx.state.tick,
          phase: ctx.state.phase,
          connections: ctx.connectionCount(),
        });
      case 'GET /api/lobby':
        return json(res, 200, ctx.state.lobby());
      case 'POST /api/auth/start': {
        const body = (await readJson(req)) as { email?: unknown; name?: unknown } | null;
        return json(res, 200, await ctx.auth.start(body?.email, body?.name, req.headers.origin));
      }
      case 'POST /api/auth/verify': {
        const body = (await readJson(req)) as { email?: unknown; code?: unknown } | null;
        const result = ctx.auth.verify(body?.email, body?.code);
        ctx.onChange();
        return json(res, 200, result);
      }
      case 'GET /api/admin/state':
      case 'POST /api/admin/action': {
        if (!isAdmin(req, ctx.adminToken)) return json(res, 401, { error: 'Unauthorized' });
        if (req.method === 'POST') {
          const action = parseAdminAction(await readJson(req));
          if (!action) throw new RuleError('Unknown admin action');
          runAdminAction(ctx, action);
          log.info(`Admin action: ${JSON.stringify(action)}`);
          ctx.onChange();
        }
        return json(res, 200, ctx.state.adminState());
      }
      default:
        return json(res, 404, { error: 'Not found' } satisfies ApiError);
    }
  } catch (error) {
    if (error instanceof RuleError) {
      return json(res, 400, { error: error.message } satisfies ApiError);
    }
    log.error(`HTTP ${route} failed`, error);
    return json(res, 500, { error: 'Internal error' } satisfies ApiError);
  }
}

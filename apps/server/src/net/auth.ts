import { randomInt, timingSafeEqual } from 'node:crypto';
import { normalizeEmail, type AuthStartResponse, type AuthVerifyResponse } from '@vectoria/shared';
import { RuleError, type GameState } from '../game/GameState';
import { log } from '../logger';
import type { Mailer } from '../mail';

const CODE_TTL_MS = 15 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_PENDING = 1_000;

interface PendingCode {
  code: string;
  sentAt: number;
  expiresAt: number;
  attempts: number;
  /** Set for a new registration; null for a login of a known player. */
  name: string | null;
}

/**
 * Passwordless login: a 6-digit code (and a link carrying it) is emailed; confirming it returns
 * the player's session token. Unknown addresses register during the registration phase.
 * Pending codes live in memory, so a server restart just means requesting a new one.
 */
export class EmailAuth {
  private readonly pending = new Map<string, PendingCode>();
  private readonly state: GameState;
  private readonly mailer: Mailer;
  private readonly publicUrl: string | undefined;

  constructor(state: GameState, mailer: Mailer, publicUrl: string | undefined) {
    this.state = state;
    this.mailer = mailer;
    this.publicUrl = publicUrl;
  }

  async start(rawEmail: unknown, rawName: unknown, origin?: string): Promise<AuthStartResponse> {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new RuleError('Bitte gib eine gültige E-Mail-Adresse ein.');
    const now = Date.now();
    this.purge(now);
    const previous = this.pending.get(email);
    if (previous && now - previous.sentAt < RESEND_AFTER_MS) {
      throw new RuleError('Ein Code ist unterwegs. Neuen Code in einer Minute anfordern.');
    }

    let name: string | null = null;
    if (!this.state.playerIdForEmail(email)) {
      if (this.state.phase !== 'registration') {
        throw new RuleError(
          'Diese E-Mail ist nicht angemeldet, und die Anmeldung ist geschlossen.',
        );
      }
      if (typeof rawName !== 'string' || rawName.trim() === '') return { status: 'needsName' };
      name = this.state.checkNewPlayer(rawName, email);
    }
    if (this.pending.size >= MAX_PENDING) throw new RuleError('Gerade zu viele Anfragen.');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.pending.set(email, { code, sentAt: now, expiresAt: now + CODE_TTL_MS, attempts: 0, name });
    const base = this.publicUrl ?? origin;
    const link = base ? `${base}/?email=${encodeURIComponent(email)}&code=${code}` : null;
    try {
      await this.mailer.send({
        to: email,
        subject: `Vectoria: dein Code ${code}`,
        text: [
          name ? `Willkommen bei Vectoria, ${name}!` : 'Hallo bei Vectoria!',
          '',
          `Dein Anmeldecode: ${code}`,
          ...(link ? ['', `Oder direkt anmelden: ${link}`] : []),
          '',
          'Der Code gilt 15 Minuten. Wenn du ihn nicht angefordert hast, ignoriere diese E-Mail.',
        ].join('\n'),
      });
    } catch (error) {
      this.pending.delete(email);
      log.error(`Sending login mail to ${email} failed`, error);
      throw new RuleError(
        'Die E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.',
      );
    }
    return { status: 'sent' };
  }

  verify(rawEmail: unknown, rawCode: unknown): AuthVerifyResponse {
    const email = normalizeEmail(rawEmail);
    const code = typeof rawCode === 'string' ? rawCode.replace(/\s/g, '') : '';
    const entry = email ? this.pending.get(email) : undefined;
    if (!email || !entry || entry.expiresAt < Date.now()) {
      if (email) this.pending.delete(email);
      throw new RuleError('Der Code ist abgelaufen. Bitte fordere einen neuen an.');
    }
    if (!sameCode(code, entry.code)) {
      entry.attempts++;
      if (entry.attempts >= MAX_ATTEMPTS) this.pending.delete(email);
      throw new RuleError('Falscher Code.');
    }
    this.pending.delete(email);

    if (entry.name !== null) {
      const result = this.state.register(entry.name, email);
      log.info(`Player "${entry.name}" registered`);
      return result;
    }
    const playerId = this.state.playerIdForEmail(email);
    const token = playerId && this.state.tokenFor(playerId);
    if (!playerId || !token) throw new RuleError('Diese E-Mail ist nicht mehr angemeldet.');
    return { token, playerId };
  }

  private purge(now: number): void {
    for (const [email, entry] of this.pending) {
      if (entry.expiresAt < now) this.pending.delete(email);
    }
  }
}

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { createTransport } from 'nodemailer';
import type { Config } from './config';
import { log } from './logger';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** SMTP mailer, or a log-only stand-in when no SMTP server is configured (dev). */
export function createMailer(config: Pick<Config, 'smtp' | 'mailFrom'>): Mailer {
  const { smtp, mailFrom } = config;
  if (!smtp) {
    log.warn('SMTP_HOST not set: login emails are written to the log instead of sent');
    return {
      send: (mail) => {
        log.info(`Mail to ${mail.to}: ${mail.subject}\n${mail.text}`);
        return Promise.resolve();
      },
    };
  }
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
  });
  return {
    send: async (mail) => {
      await transport.sendMail({ from: mailFrom, ...mail });
    },
  };
}

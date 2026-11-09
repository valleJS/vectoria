import type { PushTopic } from '@vectoria/shared';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePush } from '../net/push';
import { Button } from './Panel';

/** The notification kinds a player can pick, in the settings' order. */
const TOPICS: { topic: PushTopic; title: string; detail: string }[] = [
  {
    topic: 'returned',
    title: 'Truppen zurück in der Burg',
    detail: 'Ein Zug ist daheim angekommen – mit Ladung, Beute oder einer Truhe.',
  },
  {
    topic: 'outpost',
    title: 'Truppen am Stützpunkt',
    detail: 'Ein Zug ist an deinem Stützpunkt angekommen, oder du hast einen erobert.',
  },
  {
    topic: 'attack',
    title: 'Angriff auf Burg oder Stützpunkt',
    detail: 'Jemand zieht offen gegen deine Burg oder einen deiner Stützpunkte.',
  },
  {
    topic: 'raid',
    title: 'Überfall auf einen Zug',
    detail: 'Jemand jagt einen deiner Züge unterwegs.',
  },
];

/**
 * Push notifications for this device: a link at the foot of the realm box opens the settings —
 * the main switch and which kinds of notices to get. Arrivals at deposits never notify; while
 * Vectoria is open in view, nothing is pushed. Hidden where the browser can't do push.
 */
export function PushSettings() {
  const { status, toggle, topics, setTopic } = usePush();
  const [open, setOpen] = useState(false);
  if (status === 'unsupported') return null;

  const summary =
    status === 'on'
      ? topics.length === TOPICS.length
        ? 'an'
        : topics.length === 0
          ? 'stumm'
          : `${topics.length} von ${TOPICS.length}`
      : status === 'busy'
        ? '…'
        : status === 'denied'
          ? 'blockiert'
          : status === 'install'
            ? 'nur als App'
            : 'aus';

  return (
    <>
      <Button variant="link" className="text-xs" onClick={() => setOpen(true)}>
        Benachrichtigungen: {summary}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Benachrichtigungen</DialogTitle>
            <DialogDescription>
              Gilt für dieses Gerät. Solange Vectoria hier offen ist, kommt nichts – du siehst es ja
              auf der Karte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
            {status === 'install' ? (
              <p className="text-sm leading-snug">
                Auf iPhone und iPad gehen Benachrichtigungen nur aus der App: im Teilen-Menü „Zum
                Home-Bildschirm“ wählen, Vectoria von dort öffnen und hier einschalten.
              </p>
            ) : status === 'denied' ? (
              <p className="text-sm leading-snug">
                Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Einstellungen
                deines Browsers, dann kannst du sie hier einschalten.
              </p>
            ) : (
              <>
                <Label className="cursor-pointer gap-2 font-bold">
                  <Checkbox
                    checked={status === 'on'}
                    disabled={status === 'busy'}
                    onCheckedChange={toggle}
                  />
                  Benachrichtigungen auf diesem Gerät
                </Label>
                <ul className="space-y-2 border-t border-ink/20 pt-3">
                  {TOPICS.map(({ topic, title, detail }) => (
                    <li key={topic}>
                      <Label className="cursor-pointer items-start gap-2 leading-snug">
                        <Checkbox
                          className="mt-0.5"
                          checked={topics.includes(topic)}
                          disabled={status !== 'on'}
                          onCheckedChange={(value) => setTopic(topic, value === true)}
                        />
                        <span>
                          <b>{title}</b>
                          <span className="block text-xs text-ink-soft">{detail}</span>
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-soft">
                  Ankünfte an Holz, Stein und Gold melden sich nie.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

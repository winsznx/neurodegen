'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { useTelegramLink } from '@/hooks/useTelegramLink';
import type { TelegramPreferences } from '@/types/telegram';

interface LinkResponse {
  token: string;
  url: string;
  expiresAt: string;
}

const PREF_ROWS: { key: keyof TelegramPreferences; label: string; hint: string }[] = [
  { key: 'mirror_opened', label: 'Position opens', hint: 'Agent entry that mirrors to you.' },
  { key: 'mirror_closed', label: 'Position closes', hint: 'Exit + realized P&L.' },
  { key: 'mirror_skipped', label: 'Skipped signals', hint: 'Entries filtered out by your caps. Off by default.' },
  { key: 'health_alerts', label: 'Health alerts', hint: 'Perception / cognition / execution degraded.' },
  { key: 'agent_status', label: 'Agent status', hint: 'Start / stop / daily-loss pause.' },
  { key: 'daily_summary', label: 'Daily summary', hint: 'End-of-UTC-day digest.' },
];

export function TelegramConnect() {
  const tg = useTelegramLink();
  const [pending, setPending] = useState(false);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [prefSaving, setPrefSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setCountdown(0);
      return;
    }
    const tick = (): void => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        setPopupUrl(null);
        setExpiresAt(null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleConnect = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/me/telegram', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `link failed: ${res.status}`);
      }
      const body = (await res.json()) as LinkResponse;
      setPopupUrl(body.url);
      setExpiresAt(new Date(body.expiresAt).getTime());
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const handleUnlink = async (): Promise<void> => {
    if (!window.confirm('Unlink Telegram from your NeuroDegen account?')) return;
    setPending(true);
    setError(null);
    try {
      await fetch('/api/me/telegram', { method: 'DELETE', credentials: 'include' });
      await tg.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const handleTogglePref = async (key: keyof TelegramPreferences): Promise<void> => {
    if (!tg.subscription) return;
    setPrefSaving(key);
    try {
      const res = await fetch('/api/me/telegram/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: !tg.subscription.preferences[key] }),
      });
      if (!res.ok) throw new Error(`preference update failed: ${res.status}`);
      await tg.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrefSaving(null);
    }
  };

  const content = useMemo(() => {
    if (tg.loading) {
      return <div className="p-5 font-mono text-xs text-text-tertiary">loading…</div>;
    }

    if (!tg.configured) {
      return (
        <div className="p-5 space-y-2 font-mono text-xs text-text-secondary">
          <p>
            Telegram notifications are not configured on the server yet. Ask the admin to set{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 text-text-primary">TELEGRAM_BOT_TOKEN</code>,{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 text-text-primary">TELEGRAM_BOT_USERNAME</code>, and{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 text-text-primary">TELEGRAM_WEBHOOK_SECRET</code>.
          </p>
        </div>
      );
    }

    if (!tg.subscription) {
      return (
        <div className="space-y-4 p-5">
          <p className="font-mono text-xs leading-relaxed text-text-secondary">
            One tap links this Privy account to a Telegram chat. We open the bot with a short-lived token — no copy/paste, no manual codes. Token expires in 10 minutes.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleConnect} disabled={pending}>
              {pending ? 'generating link…' : 'Connect Telegram →'}
            </Button>
            {popupUrl ? (
              <a
                href={popupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-accent hover:underline"
              >
                reopen link {countdown > 0 ? `(${countdown}s)` : ''}
              </a>
            ) : null}
          </div>
          {error ? <div className="font-mono text-[11px] text-accent-red">{error}</div> : null}
          <div className="border-t border-border/60 pt-3 font-mono text-[11px] text-text-tertiary">
            Once linked, you&apos;ll receive alerts on entries, exits, P&amp;L, and agent health. Every notification type is toggleable below.
          </div>
        </div>
      );
    }

    const sub = tg.subscription;
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-text-tertiary">linked as</span>
            <span className="font-semibold text-text-primary">
              {sub.username ? `@${sub.username}` : sub.firstName ?? 'telegram user'}
            </span>
          </div>
          <Button variant="ghost" onClick={handleUnlink} disabled={pending}>
            unlink
          </Button>
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            notifications
          </div>
          {PREF_ROWS.map((row) => {
            const enabled = sub.preferences[row.key];
            const saving = prefSaving === row.key;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => void handleTogglePref(row.key)}
                disabled={saving}
                className="flex w-full items-center justify-between gap-3 rounded-sm border border-transparent px-2 py-2 text-left transition-colors hover:bg-surface-hover/40 disabled:opacity-60"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-text-primary">{row.label}</div>
                  <div className="font-mono text-[10px] leading-snug text-text-tertiary">{row.hint}</div>
                </div>
                <Toggle enabled={enabled} saving={saving} />
              </button>
            );
          })}
        </div>

        {error ? <div className="font-mono text-[11px] text-accent-red">{error}</div> : null}
      </div>
    );
  }, [tg, pending, popupUrl, countdown, error, prefSaving]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        {tg.subscription ? (
          <Badge tone="green" dot>linked</Badge>
        ) : tg.configured ? (
          <Badge tone="neutral">not linked</Badge>
        ) : (
          <Badge tone="yellow">not configured</Badge>
        )}
      </CardHeader>
      {content}
    </Card>
  );
}

function Toggle({ enabled, saving }: { enabled: boolean; saving: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
        enabled ? 'border-accent/70 bg-accent/30' : 'border-border bg-surface'
      } ${saving ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 size-3.5 rounded-full bg-text-primary transition-transform ${
          enabled ? 'translate-x-[18px] bg-accent' : 'translate-x-[2px]'
        }`}
      />
    </span>
  );
}

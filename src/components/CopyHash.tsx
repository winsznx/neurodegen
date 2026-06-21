'use client';

import { useState } from 'react';
import { fmtAddr } from '@/lib/format';

interface CopyHashProps {
  value: string;
  display?: string;
  head?: number;
  tail?: number;
  /** Optional bscscan link the truncated text wraps; only the copy icon copies. */
  href?: string;
  className?: string;
}

/**
 * Truncated hash/address with a click-to-copy button. The truncated value
 * itself is optionally a link (e.g. to BscScan). The dedicated copy icon
 * places the full value on the clipboard and surfaces a 1.5s "Copied" toast.
 */
export function CopyHash({ value, display, head, tail, href, className }: CopyHashProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const text = display ?? fmtAddr(value, { head, tail });

  async function handleCopy(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied fail silent */
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${className ?? ''}`}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-primary hover:text-accent hover:underline"
        >
          {text}
        </a>
      ) : (
        <span className="text-text-primary">{text}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
        className="inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface hover:text-accent"
      >
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="4" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {copied ? (
        <span className="text-[10px] uppercase tracking-wider text-positive">copied</span>
      ) : null}
    </span>
  );
}

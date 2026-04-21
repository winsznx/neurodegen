'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFundWallet, useSendTransaction } from '@privy-io/react-auth';
import { createPublicClient, http, formatEther, formatUnits, parseEther, parseUnits } from 'viem';
import { bsc } from 'viem/chains';
import { Card, CardBody, CardHeader, CardTitle, Button, Badge } from '@/components/ui';

const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;
const ERC20_BALANCE_ABI = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
}] as const;

const bscClient = createPublicClient({ chain: bsc, transport: http('https://bsc.drpc.org') });

async function fetchBalances(address: `0x${string}`): Promise<{ bnb: string; usdt: string }> {
  const [bnbWei, usdtRaw] = await Promise.all([
    bscClient.getBalance({ address }),
    bscClient.readContract({ address: USDT_ADDRESS, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [address] }),
  ]);
  return { bnb: formatEther(bnbWei), usdt: formatUnits(usdtRaw, 18) };
}

export function WalletCard({ address }: { address: `0x${string}` }) {
  const { fundWallet } = useFundWallet();
  const { sendTransaction } = useSendTransaction();
  const [balances, setBalances] = useState<{ bnb: string; usdt: string } | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<'bnb' | 'usdt' | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    setLoadingBalances(true);
    try {
      const b = await fetchBalances(address);
      setBalances(b);
    } catch (err) {
      console.error('[wallet] balance fetch failed:', err);
    } finally {
      setLoadingBalances(false);
    }
  }, [address]);

  useEffect(() => { void reload(); }, [reload]);

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSend = async (): Promise<void> => {
    if (!sendMode || !/^0x[a-fA-F0-9]{40}$/.test(sendTo)) {
      setSendError('invalid recipient address');
      return;
    }
    const amt = Number(sendAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSendError('invalid amount');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      if (sendMode === 'bnb') {
        await sendTransaction({ to: sendTo as `0x${string}`, value: parseEther(sendAmount), chainId: 56 });
      } else {
        const data = `0xa9059cbb${sendTo.slice(2).padStart(64, '0')}${parseUnits(sendAmount, 18).toString(16).padStart(64, '0')}` as `0x${string}`;
        await sendTransaction({ to: USDT_ADDRESS, data, chainId: 56 });
      }
      setSendMode(null);
      setSendTo('');
      setSendAmount('');
      void reload();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet</CardTitle>
        <Badge tone="neutral">BSC · 56</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <code className="break-all rounded border border-border bg-background/60 px-2 py-1 font-mono text-xs text-text-primary">{address}</code>
          <button onClick={copy} className="font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-accent">
            {copied ? 'copied' : 'copy'}
          </button>
          <a
            href={`https://bscscan.com/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-wider text-accent hover:text-accent-hover"
          >
            bscscan ↗
          </a>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border">
          <Balance label="BNB (gas)" value={loadingBalances ? '…' : formatBalance(balances?.bnb)} />
          <Balance label="USDT (collateral)" value={loadingBalances ? '…' : formatBalance(balances?.usdt)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => fundWallet({ address })}>Fund wallet</Button>
          <Button variant="secondary" onClick={() => setSendMode(sendMode === 'bnb' ? null : 'bnb')}>
            {sendMode === 'bnb' ? 'cancel' : 'send BNB'}
          </Button>
          <Button variant="secondary" onClick={() => setSendMode(sendMode === 'usdt' ? null : 'usdt')}>
            {sendMode === 'usdt' ? 'cancel' : 'send USDT'}
          </Button>
          <Button variant="ghost" onClick={() => void reload()}>refresh</Button>
        </div>

        {sendMode && (
          <div className="space-y-2 rounded border border-border bg-surface/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              send {sendMode.toUpperCase()} from your wallet
            </div>
            <input
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="0x recipient address"
              className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-text-primary outline-hidden focus:border-accent"
            />
            <input
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder={`amount ${sendMode.toUpperCase()}`}
              inputMode="decimal"
              className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-text-primary outline-hidden focus:border-accent"
            />
            {sendError && <div className="font-mono text-[11px] text-negative">{sendError}</div>}
            <Button variant="primary" onClick={handleSend} disabled={sending}>
              {sending ? 'sending…' : `confirm send ${sendMode.toUpperCase()}`}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

function formatBalance(raw?: string): string {
  if (!raw) return '0';
  const n = Number(raw);
  if (n === 0) return '0';
  if (n < 0.0001) return '< 0.0001';
  if (n < 1) return n.toFixed(5);
  return n.toFixed(4);
}

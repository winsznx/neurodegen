import type { ExecutionGateway } from '@/lib/services/execution/executionGateway';
import { getOpenPositions } from '@/lib/queries/positions';
import { getRecentReasoningChains } from '@/lib/queries/reasoningChains';
import { agentLoop } from '@/lib/services/agentLoop';
import { fetchWorkerStatusRaw } from '@/lib/services/workerAdminProxy';

interface ParsedCommand {
  command: 'monitor' | 'positions' | 'reasoning' | 'close-all' | 'status' | 'unknown';
  requiresPayment: boolean;
  requiresConfirmation: boolean;
}

const PATTERNS: Array<{ keywords: string[]; command: ParsedCommand }> = [
  { keywords: ['monitor', 'start watching', 'begin monitoring'], command: { command: 'monitor', requiresPayment: true, requiresConfirmation: false } },
  { keywords: ['close all', 'exit all', 'close everything'], command: { command: 'close-all', requiresPayment: false, requiresConfirmation: true } },
  { keywords: ['positions', 'my positions', "what's open", 'show positions'], command: { command: 'positions', requiresPayment: false, requiresConfirmation: false } },
  { keywords: ['reasoning', 'show reasoning', 'why did you trade', 'explain', 'current reasoning'], command: { command: 'reasoning', requiresPayment: false, requiresConfirmation: false } },
  { keywords: ['status', 'are you running', 'agent status'], command: { command: 'status', requiresPayment: false, requiresConfirmation: false } },
];

const WORKER_ADMIN_TIMEOUT_MS = 15_000;

export interface SkillExecutionResult {
  response: string;
  data?: unknown;
}

export class PieverseSkillWrapper {
  constructor(
    private gatewayProvider: () => ExecutionGateway | null = () => agentLoop.getExecutionGateway()
  ) {}

  parseCommand(input: string): ParsedCommand {
    const lower = input.toLowerCase();
    for (const pattern of PATTERNS) {
      if (pattern.keywords.some((kw) => lower.includes(kw))) {
        return { ...pattern.command };
      }
    }
    return { command: 'unknown', requiresPayment: false, requiresConfirmation: false };
  }

  private workerAdminBaseUrl(): string | null {
    const url = process.env.WORKER_ADMIN_URL;
    if (!url) return null;
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private async postWorkerAdmin(path: string): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
  }> {
    const base = this.workerAdminBaseUrl();
    const secret = process.env.ADMIN_SECRET;
    if (!base || !secret) {
      return {
        ok: false,
        status: 503,
        body: { error: 'worker admin is not configured' },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WORKER_ADMIN_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': secret },
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text ? { raw: text } : null;
      }
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (err) {
      return {
        ok: false,
        status: 502,
        body: { error: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeCommand(
    command: string,
    paymentVerified: boolean,
    options: { confirmed?: boolean } = {}
  ): Promise<SkillExecutionResult> {
    switch (command) {
      case 'monitor':
        return this.handleMonitor(paymentVerified);
      case 'positions':
        return this.handlePositions();
      case 'reasoning':
        return this.handleReasoning();
      case 'close-all':
        return this.handleCloseAll(options.confirmed === true);
      case 'status':
        return this.handleStatus();
      default:
        return { response: 'Unknown command. Try: monitor, positions, reasoning, close-all, status' };
    }
  }

  private async handleMonitor(paymentVerified: boolean): Promise<SkillExecutionResult> {
    if (!paymentVerified) return { response: 'Payment required to start monitoring.' };
    if (this.workerAdminBaseUrl()) {
      const remote = await this.postWorkerAdmin('/admin/start');
      if (!remote.ok) {
        const detail = remote.body as { error?: string } | null;
        return { response: `Worker start failed: ${detail?.error ?? `HTTP ${remote.status}`}` };
      }
      return { response: 'Monitoring active on the live worker. Position opens and closes will appear on the dashboard.' };
    }
    const status = agentLoop.getStatus();
    if (status.running) return { response: 'Monitoring already active.' };
    await agentLoop.start();
    return { response: 'Monitoring active. Position opens and closes will appear on the dashboard.' };
  }

  private async handlePositions(): Promise<SkillExecutionResult> {
    const positions = await getOpenPositions();
    if (positions.length === 0) return { response: 'No open positions.' };
    const lines = positions.map((p) =>
      `${p.pair} ${p.isLong ? 'LONG' : 'SHORT'} | entry $${p.entryPrice} | size $${p.collateralUsd}@${p.leverage}x | ${p.status}`
    );
    return { response: lines.join('\n'), data: positions };
  }

  private async handleReasoning(): Promise<SkillExecutionResult> {
    const chains = await getRecentReasoningChains(1);
    if (chains.length === 0) return { response: 'No reasoning cycles yet.' };
    const latest = chains[0];
    return {
      response: `regime ${latest.regime} | ${latest.finalAction.action} ${(latest.finalAction.confidence * 100).toFixed(0)}% — ${latest.finalAction.rationale}`,
      data: latest,
    };
  }

  private async handleCloseAll(confirmed: boolean): Promise<SkillExecutionResult> {
    if (!confirmed) {
      return {
        response: 'Close-all requires confirmation. Re-send with confirmed=true to proceed.',
      };
    }
    if (this.workerAdminBaseUrl()) {
      const positions = await getOpenPositions();
      if (positions.length === 0) {
        return { response: 'No open positions.' };
      }
      const results = await Promise.all(
        positions.map((position) => this.postWorkerAdmin(`/admin/close/${position.positionId}`))
      );
      const closed = results.filter((result) => result.ok).length;
      if (closed === 0) {
        const first = results[0]?.body as { error?: string } | null | undefined;
        return { response: `Close-all failed on worker: ${first?.error ?? 'no positions were accepted'}` };
      }
      return { response: `Close-all submitted for ${closed} position${closed === 1 ? '' : 's'} on the live worker.` };
    }
    const gateway = this.gatewayProvider();
    if (!gateway) {
      return { response: 'Execution gateway is not initialized. Start the agent first.' };
    }
    const status = agentLoop.getStatus();
    const regime = status.currentRegime;
    await gateway.checkAndClosePositions(regime, null);
    return { response: 'Close-all submitted for every managed position.' };
  }

  private async handleStatus(): Promise<SkillExecutionResult> {
    if (this.workerAdminBaseUrl()) {
      const resolved = await fetchWorkerStatusRaw();
      if (!resolved.ok) {
        return { response: `agent unreachable | ${resolved.detail}` };
      }
      const s = resolved.status as {
        running: boolean;
        currentRegime: string;
        cycleCount: number;
        connectedSSEClients: number;
      };
      return {
        response: `agent ${s.running ? 'RUNNING' : 'STOPPED'} | regime ${s.currentRegime} | cycles ${s.cycleCount} | clients ${s.connectedSSEClients}`,
        data: s,
      };
    }
    const s = agentLoop.getStatus();
    return {
      response: `agent ${s.running ? 'RUNNING' : 'STOPPED'} | regime ${s.currentRegime} | cycles ${s.cycleCount} | clients ${s.connectedSSEClients}`,
      data: s,
    };
  }
}

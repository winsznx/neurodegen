import { cn } from '@/lib/utils/cn';

const LAYERS = [
  {
    name: 'Perception',
    color: 'accent-blue',
    sources: ['Bitquery WS', 'MYX REST', 'Pyth Hermes'],
    produces: 'Normalized events → rolling aggregates',
  },
  {
    name: 'Cognition',
    color: 'accent-purple',
    sources: ['Claude · /v1/messages', 'GPT-4o · /v1/chat', 'DeepSeek v3.2 · /v1/chat'],
    produces: 'Sentiment + feature extraction + action classification → Reasoning Graph',
  },
  {
    name: 'Execution',
    color: 'accent-green',
    sources: ['@myx-trade/sdk', 'BSC RPC', 'Pyth Hermes'],
    produces: 'Pre-checks → commit → IncreaseOrder + TP/SL → keeper poll → reveal',
  },
  {
    name: 'Monetization',
    color: 'accent-yellow',
    sources: ['Privy signers', 'x402 + pieUSD', 'Mirror dispatcher'],
    produces: 'Copy-trade fan-out to users + paid skill commands on BSC',
  },
] as const;

const COLOR_CLASS: Record<(typeof LAYERS)[number]['color'], string> = {
  'accent-blue': 'text-accent-blue border-accent-blue/40 bg-accent-blue/5',
  'accent-purple': 'text-accent-purple border-accent-purple/40 bg-accent-purple/5',
  'accent-green': 'text-accent-green border-accent-green/40 bg-accent-green/5',
  'accent-yellow': 'text-accent-yellow border-accent-yellow/40 bg-accent-yellow/5',
};

export function ArchitectureDiagram() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12">
          <div className="font-mono text-xs uppercase tracking-wider text-accent-green">Architecture</div>
          <h2 className="mt-3 font-mono text-3xl font-bold tracking-tight md:text-4xl">
            Four layers. Unidirectional flow.
          </h2>
          <p className="mt-3 max-w-2xl text-text-secondary">
            No layer calls backwards. Perception feeds Cognition. Cognition feeds Execution.
            Execution emits attestations. Monetization wraps the core.
          </p>
        </div>

        <div className="space-y-3">
          {LAYERS.map((layer, i) => (
            <div
              key={layer.name}
              className={cn(
                'flex flex-col gap-4 rounded-lg border p-5 md:flex-row md:items-center md:gap-8',
                COLOR_CLASS[layer.color]
              )}
            >
              <div className="flex items-center gap-4 md:w-64">
                <div className="font-mono text-4xl font-bold tabular-nums opacity-40">
                  0{i + 1}
                </div>
                <div>
                  <div className="font-mono text-lg font-semibold text-text-primary">
                    {layer.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider opacity-60">
                    layer
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 font-mono text-xs md:flex-row md:items-center md:gap-6">
                <div className="flex flex-wrap gap-1.5">
                  {layer.sources.map((source) => (
                    <span
                      key={source}
                      className="rounded border border-current/20 bg-background/40 px-2 py-1 text-[11px] text-text-secondary"
                    >
                      {source}
                    </span>
                  ))}
                </div>
                <div className="shrink-0 text-text-muted md:w-6">→</div>
                <div className="text-text-primary">{layer.produces}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

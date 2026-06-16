export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';
export type SignalPriority = 'narrative' | 'quant' | 'balanced';

export interface MandateConfig {
  maxDrawdownPct: number;
  maxPositionPct: number;
  dailyLossCapPct: number;
  consecutiveLossHalt: number;
  signalPriority: SignalPriority;
  riskLevel: RiskLevel;
  crashProtocolFGThreshold: number;
}

export const DEFAULT_MANDATE: MandateConfig = {
  maxDrawdownPct: 0.2,
  maxPositionPct: 0.08,
  dailyLossCapPct: 0.05,
  consecutiveLossHalt: 3,
  signalPriority: 'balanced',
  riskLevel: 'moderate',
  crashProtocolFGThreshold: 25,
};

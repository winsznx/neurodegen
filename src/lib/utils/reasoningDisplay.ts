import type { ActionRecommendation, ReasoningGraph } from '@/types/cognition';
import { NO_OPEN_MANAGED_POSITION_TO_CLOSE } from '@/lib/services/execution/executionMessages';

type ActionType = ActionRecommendation['action'];
type Tone = 'neutral' | 'green' | 'red' | 'yellow';

export function getDisplayedAction(graph: ReasoningGraph): ActionType {
  if (
    graph.finalAction.action === 'close_position' &&
    graph.executionResult?.executed === false &&
    graph.executionResult.failureReason === NO_OPEN_MANAGED_POSITION_TO_CLOSE
  ) {
    return 'hold';
  }

  return graph.finalAction.action;
}

export function formatActionLabel(action: ActionType): string {
  return action.replace(/_/g, ' ');
}

export function getExecutionSummary(graph: ReasoningGraph): {
  tone: Tone;
  title: string;
  body: string;
} {
  const execution = graph.executionResult;

  if (
    graph.finalAction.action === 'close_position' &&
    execution?.executed === false &&
    execution.failureReason === NO_OPEN_MANAGED_POSITION_TO_CLOSE
  ) {
    return {
      tone: 'neutral',
      title: 'No Open Position',
      body: 'The model recommended closing exposure, but the agent had no managed position open, so no transaction was submitted.',
    };
  }

  if (execution?.executed) {
    const txNote = execution.txHash ? ` Tx: ${execution.txHash}.` : '';
    if (graph.finalAction.action === 'close_position') {
      return {
        tone: 'green',
        title: 'Close Submitted',
        body: `The agent submitted a close order for the currently managed position set.${txNote}`,
      };
    }

    return {
      tone: 'green',
      title: 'Order Submitted',
      body: `The agent submitted the recommended ${formatActionLabel(graph.finalAction.action)} order on-chain.${txNote}`,
    };
  }

  if (execution?.failureReason) {
    return {
      tone: 'red',
      title: 'Execution Skipped',
      body: execution.failureReason,
    };
  }

  if (graph.finalAction.action === 'hold' || graph.finalAction.action === 'adjust_parameters') {
    return {
      tone: 'neutral',
      title: 'No Order Submitted',
      body: 'This cycle ended as analysis only. The execution layer did not send a transaction.',
    };
  }

  return {
    tone: 'yellow',
    title: 'Recommendation Only',
    body: 'The model produced a recommendation, but there is no recorded on-chain execution result for this reasoning graph.',
  };
}

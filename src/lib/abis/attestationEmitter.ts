export const attestationEmitterAbi = [
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { name: 'reasoningGraphId', type: 'bytes32', indexed: true },
      { name: 'pairIndex', type: 'uint256', indexed: false },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'sizeAmount', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionClosed',
    inputs: [
      { name: 'reasoningGraphId', type: 'bytes32', indexed: true },
      { name: 'pairIndex', type: 'uint256', indexed: false },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'realizedPnl', type: 'int256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RegimeChanged',
    inputs: [
      { name: 'fromRegime', type: 'bytes32', indexed: true },
      { name: 'toRegime', type: 'bytes32', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'attestPositionOpen',
    inputs: [
      { name: 'reasoningGraphId', type: 'bytes32' },
      { name: 'pairIndex', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'sizeAmount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'attestPositionClose',
    inputs: [
      { name: 'reasoningGraphId', type: 'bytes32' },
      { name: 'pairIndex', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'realizedPnl', type: 'int256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'attestRegimeChange',
    inputs: [
      { name: 'fromRegime', type: 'bytes32' },
      { name: 'toRegime', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'ReasoningCommitted',
    inputs: [
      { name: 'reasoningHash', type: 'bytes32', indexed: true },
      { name: 'actionIntent', type: 'bytes32', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExecutionRevealed',
    inputs: [
      { name: 'reasoningHash', type: 'bytes32', indexed: true },
      { name: 'myxTxHash', type: 'bytes32', indexed: false },
      { name: 'orderId', type: 'bytes32', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'commitReasoning',
    inputs: [
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'actionIntent', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revealExecution',
    inputs: [
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'myxTxHash', type: 'bytes32' },
      { name: 'orderId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

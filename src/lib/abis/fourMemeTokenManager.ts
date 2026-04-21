export const fourMemeTokenManagerAbi = [
  {
    type: 'event',
    name: 'TokenCreate',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'initialSupply', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokenPurchase',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'bnbAmount', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'curveBalance', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'bnbAmount', type: 'uint256', indexed: false },
      { name: 'lpBurned', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PairCreated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'pair', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PoolCreated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'pool', type: 'address', indexed: false },
    ],
  },
] as const;

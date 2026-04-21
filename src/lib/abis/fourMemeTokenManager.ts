export const fourMemeTokenManagerAbi = [
  {
    type: 'event',
    name: 'TokenCreate',
    anonymous: false,
    inputs: [
      { name: 'creator', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'requestId', type: 'uint256', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
      { name: 'launchTime', type: 'uint256', indexed: false },
      { name: 'launchFee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokenPurchase',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: false },
      { name: 'account', type: 'address', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'cost', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'offers', type: 'uint256', indexed: false },
      { name: 'funds', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    anonymous: false,
    inputs: [
      { name: 'base', type: 'address', indexed: false },
      { name: 'offers', type: 'uint256', indexed: false },
      { name: 'quote', type: 'address', indexed: false },
      { name: 'funds', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TradeStop',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: false },
    ],
  },
] as const;

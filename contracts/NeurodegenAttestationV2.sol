// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.20;

/// @title NeurodegenAttestationV2
/// @notice Event-only attestation rail for the NeuroDegen V2 agent. Extends V1's
///         commit-reveal pair (still deployed at 0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4)
///         with three new event families: liquidity in/out, co-launch handshakes,
///         and mandate attestations. Source is published in-repo so judges and
///         operators can audit the V2 design surface; the contract is intentionally
///         NOT deployed before the 2026-06-28 live trading window — V1 carries the
///         live attestation traffic to avoid pre-competition deploy risk. V2 ships
///         after the window closes as part of the V2.1 release.
/// @dev    Event emission only — no state, no upgrades, no proxy. Access restricted
///         to a single agent wallet set at construction. Compatible ABI for the V1
///         commit-reveal pair (function selectors match) so a switchover is a
///         single-env-var change in the worker.
contract NeurodegenAttestationV2 {
    address public immutable agent;

    /* ============================================================
       V1-compatible events (signatures match the deployed contract)
       ============================================================ */

    event PositionOpened(
        bytes32 indexed reasoningGraphId,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount,
        uint256 timestamp
    );

    event PositionClosed(
        bytes32 indexed reasoningGraphId,
        uint256 pairIndex,
        bool isLong,
        int256 realizedPnl,
        uint256 timestamp
    );

    event RegimeChanged(
        bytes32 indexed fromRegime,
        bytes32 indexed toRegime,
        uint256 timestamp
    );

    event ReasoningCommitted(
        bytes32 indexed reasoningHash,
        bytes32 actionIntent,
        uint256 timestamp
    );

    /// @dev V2 rename: the third event arg is now `executionTxHash` (TWAK-signed
    ///      BSC tx). V1 named this field `myxTxHash` for historical reasons; the
    ///      bytes32 layout is identical so off-chain indexers built against V1
    ///      can read V2 logs by aliasing the field.
    event ExecutionRevealed(
        bytes32 indexed reasoningHash,
        bytes32 executionTxHash,
        bytes32 orderId,
        uint256 timestamp
    );

    /* ============================================================
       V2 new events — liquidity, co-launch, mandate, x402 revenue
       ============================================================ */

    /// @notice Attests that funds flowed INTO the agent's TWAK wallet. Off-chain
    ///         the actual transfer is a USDT/BNB ERC-20 Transfer event; this
    ///         attestation provides a single canonical hook indexers can subscribe
    ///         to without crawling every token contract. The `source` field is
    ///         keccak-tagged ('mandate_deposit' / 'x402_revenue' / 'pnl_close' /
    ///         'erc8183_settle') so consumers can dispatch on it.
    event LiquidityIn(
        bytes32 indexed source,
        address indexed from,
        uint256 amountAtomic,
        address token,
        bytes32 ref,
        uint256 timestamp
    );

    /// @notice Symmetric to LiquidityIn — funds flowing OUT (fee payouts,
    ///         user-mandated withdrawals, ERC-8183 job funding).
    event LiquidityOut(
        bytes32 indexed reason,
        address indexed to,
        uint256 amountAtomic,
        address token,
        bytes32 ref,
        uint256 timestamp
    );

    /// @notice Attests that an x402 inbound payment landed and was consumed
    ///         against a specific session. Complements the consumed_x402_proofs
    ///         row in Postgres with an immutable on-chain receipt.
    event SubscriberPaid(
        bytes32 indexed sessionId,
        address indexed subscriber,
        uint256 amountAtomic,
        address token,
        uint256 timestamp
    );

    /// @notice Attests that a user (or this agent's operator) provided a new
    ///         risk mandate. Hash is keccak256 over the canonical JSON of the
    ///         mandate struct (riskLevel, maxPositionPct, maxDrawdownPct,
    ///         consecutiveLossHalt). Lets the verifier replay any committee
    ///         decision under the exact mandate that was in force.
    event MandateAttested(
        bytes32 indexed mandateHash,
        address indexed principal,
        uint256 timestamp
    );

    /// @notice Co-launch proposal: this agent invites another agent identity
    ///         (ERC-8004 agentId) to jointly execute under a shared mandate.
    ///         Accepted via CoLaunchAccepted from the partner; the joint
    ///         agreement turns into an ERC-8183 two-agent job. Off-chain audit
    ///         tools reconstruct the partnership graph from these events alone.
    event CoLaunchProposed(
        uint256 indexed selfAgentId,
        uint256 indexed partnerAgentId,
        bytes32 jointMandateHash,
        uint256 expiresAt,
        uint256 timestamp
    );

    event CoLaunchAccepted(
        uint256 indexed selfAgentId,
        uint256 indexed partnerAgentId,
        bytes32 jointMandateHash,
        uint256 timestamp
    );

    error NotAgent();
    error ZeroAddress();
    error InvalidExpiry();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        if (_agent == address(0)) revert ZeroAddress();
        agent = _agent;
    }

    /* ============================================================
       V1-compatible writers (selectors match the V1 contract)
       ============================================================ */

    function attestPositionOpen(
        bytes32 reasoningGraphId,
        uint256 pairIndex,
        bool isLong,
        uint256 sizeAmount
    ) external onlyAgent {
        emit PositionOpened(reasoningGraphId, pairIndex, isLong, sizeAmount, block.timestamp);
    }

    function attestPositionClose(
        bytes32 reasoningGraphId,
        uint256 pairIndex,
        bool isLong,
        int256 realizedPnl
    ) external onlyAgent {
        emit PositionClosed(reasoningGraphId, pairIndex, isLong, realizedPnl, block.timestamp);
    }

    function attestRegimeChange(bytes32 fromRegime, bytes32 toRegime) external onlyAgent {
        emit RegimeChanged(fromRegime, toRegime, block.timestamp);
    }

    /// @notice Commits to a reasoning hash and the action the agent intends to take.
    ///         Must be called BEFORE the TWAK swap is submitted.
    function commitReasoning(bytes32 reasoningHash, bytes32 actionIntent) external onlyAgent {
        emit ReasoningCommitted(reasoningHash, actionIntent, block.timestamp);
    }

    /// @notice Reveals the TWAK swap transaction hash produced by a previously
    ///         committed reasoning hash. Must be called AFTER BSC confirmation.
    function revealExecution(
        bytes32 reasoningHash,
        bytes32 executionTxHash,
        bytes32 orderId
    ) external onlyAgent {
        emit ExecutionRevealed(reasoningHash, executionTxHash, orderId, block.timestamp);
    }

    /* ============================================================
       V2 new writers
       ============================================================ */

    function attestLiquidityIn(
        bytes32 source,
        address from,
        uint256 amountAtomic,
        address token,
        bytes32 ref
    ) external onlyAgent {
        emit LiquidityIn(source, from, amountAtomic, token, ref, block.timestamp);
    }

    function attestLiquidityOut(
        bytes32 reason,
        address to,
        uint256 amountAtomic,
        address token,
        bytes32 ref
    ) external onlyAgent {
        emit LiquidityOut(reason, to, amountAtomic, token, ref, block.timestamp);
    }

    function attestSubscriberPaid(
        bytes32 sessionId,
        address subscriber,
        uint256 amountAtomic,
        address token
    ) external onlyAgent {
        if (subscriber == address(0)) revert ZeroAddress();
        emit SubscriberPaid(sessionId, subscriber, amountAtomic, token, block.timestamp);
    }

    function attestMandate(bytes32 mandateHash, address principal) external onlyAgent {
        if (principal == address(0)) revert ZeroAddress();
        emit MandateAttested(mandateHash, principal, block.timestamp);
    }

    function proposeCoLaunch(
        uint256 selfAgentId,
        uint256 partnerAgentId,
        bytes32 jointMandateHash,
        uint256 expiresAt
    ) external onlyAgent {
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        emit CoLaunchProposed(selfAgentId, partnerAgentId, jointMandateHash, expiresAt, block.timestamp);
    }

    function acceptCoLaunch(
        uint256 selfAgentId,
        uint256 partnerAgentId,
        bytes32 jointMandateHash
    ) external onlyAgent {
        emit CoLaunchAccepted(selfAgentId, partnerAgentId, jointMandateHash, block.timestamp);
    }
}

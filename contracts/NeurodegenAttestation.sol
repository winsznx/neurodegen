// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NeurodegenAttestation
/// @notice Emits immutable on-chain events for every agent decision, including a
///         commit-reveal pair that cryptographically links a reasoning graph to
///         the MYX transaction it produced.
/// @dev Event emission only — no state storage. Access restricted to a single
///      agent wallet set at construction. Ownership transfer is intentionally
///      not supported.
contract NeurodegenAttestation {
    address public immutable agent;

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

    event ExecutionRevealed(
        bytes32 indexed reasoningHash,
        bytes32 myxTxHash,
        bytes32 orderId,
        uint256 timestamp
    );

    error NotAgent();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        require(_agent != address(0), "agent required");
        agent = _agent;
    }

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

    /// @notice Commits to a reasoning graph hash and the action the agent intends to take.
    ///         Must be called BEFORE the MYX order is submitted.
    function commitReasoning(bytes32 reasoningHash, bytes32 actionIntent) external onlyAgent {
        emit ReasoningCommitted(reasoningHash, actionIntent, block.timestamp);
    }

    /// @notice Reveals the MYX transaction hash and order id produced by a previously
    ///         committed reasoning graph. Must be called AFTER MYX confirmation.
    function revealExecution(
        bytes32 reasoningHash,
        bytes32 myxTxHash,
        bytes32 orderId
    ) external onlyAgent {
        emit ExecutionRevealed(reasoningHash, myxTxHash, orderId, block.timestamp);
    }
}

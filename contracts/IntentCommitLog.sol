// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentCommitLog
/// @notice Tamper-evident, timestamped log of trading-agent intent commitments,
///         deployed on Mantle. An autonomous agent commits `hash(intent)` here
///         BEFORE it builds or executes an order. The off-chain guard later proves
///         the executed order matches an intent that was committed *prior to*
///         execution — so a post-commit hijack (poisoned tool result / dependency)
///         cannot forge a matching, earlier-timestamped intent.
/// @dev    First-write-wins: a hash can be committed once, making the record immutable.
contract IntentCommitLog {
    struct Commitment {
        address committer;
        uint64 timestamp;
        bool exists;
    }

    mapping(bytes32 => Commitment) private _commitments;

    event IntentCommitted(bytes32 indexed intentHash, address indexed committer, uint64 timestamp);

    error AlreadyCommitted(bytes32 intentHash);

    /// @notice Commit an intent hash. Reverts if already committed (immutability).
    function commit(bytes32 intentHash) external {
        if (_commitments[intentHash].exists) revert AlreadyCommitted(intentHash);
        _commitments[intentHash] =
            Commitment({committer: msg.sender, timestamp: uint64(block.timestamp), exists: true});
        emit IntentCommitted(intentHash, msg.sender, uint64(block.timestamp));
    }

    /// @notice Read a commitment record.
    function commitmentOf(bytes32 intentHash)
        external
        view
        returns (address committer, uint64 timestamp, bool exists)
    {
        Commitment storage c = _commitments[intentHash];
        return (c.committer, c.timestamp, c.exists);
    }

    /// @notice True iff `intentHash` was committed at or before `asOf` — i.e. proven
    ///         to predate an execution that happened at time `asOf`.
    function wasCommittedBefore(bytes32 intentHash, uint64 asOf) external view returns (bool) {
        Commitment storage c = _commitments[intentHash];
        return c.exists && c.timestamp <= asOf;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Echo confidential prior-art Registry
/// @notice A track entry can ONLY come into existence through a DON-signed CRE report
///         delivered by the Keystone forwarder (`onReport`). There is no permissionless
///         registration: "registered on-chain" and "passed the CRE pipeline CLEAN" are the
///         same event. Requirement #1 (on-chain CRE-completion gate) is therefore structural
///         — an unattested track simply has no storage.
///
///         Privacy: the artist never submits a transaction here (the DON does), so their
///         wallet never touches the chain. The only identity stored is an EPHEMERAL owner
///         key — pseudonymous and unlinkable to the artist's real identity. Ownership is
///         proven later by signing with that key (see `revealTrack`), never by `msg.sender`,
///         which keeps it compatible with Unlink `execute()` (pooled, anonymous caller) and
///         private license settlement.
contract Registry {

    enum Status { SEALED, REVEALED }

    struct Entry {
        bytes32 commitmentHash; // keccak256(fingerprint + JSON profile)
        uint256 timestamp;      // 0 == entry does not exist
        Status  status;
        bytes32 registryRef;    // keccak256(track_id) of the off-chain registry row
        address owner;          // ephemeral owner-key address; proves ownership by signature
    }

    // Note: World ID humanity/uniqueness is enforced UPSTREAM at the agent gate (only a
    // verified human can trigger a seal). The nullifier is deliberately NOT stored on-chain:
    // it is the same per human, so persisting it would make an artist's tracks publicly
    // correlatable while buying no on-chain enforcement. Add later only if a use case needs it.

    bytes4 private constant RECEIVER_INTERFACE_ID =
        bytes4(keccak256("onReport(bytes,bytes)"));

    /// @notice Keystone forwarder address. Only it can deliver a DON-verified report.
    address public immutable creAddress;

    mapping(bytes32 => Entry)     public entries;
    mapping(address => bytes32[]) public ownerTracks;

    event TrackSealed(bytes32 indexed trackId, address indexed owner, bytes32 commitmentHash, uint256 timestamp);
    event TrackRevealed(bytes32 indexed trackId, bytes32 fullProfileHash);

    error TrackNotFound();
    error AlreadyRegistered();
    error NotOwner();
    error InvalidStatus();
    error BadSignature();

    constructor(address _creAddress) {
        creAddress = _creAddress;
    }

    /// @notice Sole entry point that creates state. Reaching here means a quorum of the CRE
    ///         DON signed this report and the forwarder verified those signatures on-chain,
    ///         so it is the on-chain proof that the pipeline ran to a CLEAN verdict. Creates
    ///         AND seals the track atomically.
    /// @dev rawReport = abi.encode(address owner, bytes32 commitmentHash, bytes32 registryRef).
    ///      The CRE never dispatches on-chain for SIMILAR/REJECTED, so any entry that exists is CLEAN/SEALED.
    function onReport(
        bytes calldata /* metadata */,
        bytes calldata rawReport
    ) external {
        require(msg.sender == creAddress, "Only CRE forwarder");

        (address owner, bytes32 commitmentHash, bytes32 registryRef) =
            abi.decode(rawReport, (address, bytes32, bytes32));

        // Deterministic id: the frontend and CRE can compute the same value off-chain to
        // reference the track during analysis, before it exists on-chain.
        bytes32 trackId = keccak256(abi.encode(owner, commitmentHash));
        if (entries[trackId].timestamp != 0) revert AlreadyRegistered();

        entries[trackId] = Entry({
            commitmentHash: commitmentHash,
            timestamp:      block.timestamp,
            status:         Status.SEALED,
            registryRef:    registryRef,
            owner:          owner
        });

        ownerTracks[owner].push(trackId);
        emit TrackSealed(trackId, owner, commitmentHash, block.timestamp);
    }

    /// @notice Reveal a sealed track's full profile. Authorized by an ECDSA signature from
    ///         the owner key, NOT by msg.sender — so the call can be relayed (e.g. through
    ///         Unlink) without exposing the owner's wallet.
    /// @param ownerSig EIP-191 signature by `owner` over keccak256(abi.encode(trackId, fullProfileHash)).
    function revealTrack(bytes32 trackId, bytes32 fullProfileHash, bytes calldata ownerSig) external {
        Entry storage entry = entries[trackId];
        if (entry.timestamp == 0) revert TrackNotFound();
        if (entry.status != Status.SEALED) revert InvalidStatus();

        bytes32 digest = _ethSignedMessageHash(keccak256(abi.encode(trackId, fullProfileHash)));
        if (_recover(digest, ownerSig) != entry.owner) revert NotOwner();

        entry.status = Status.REVEALED;
        emit TrackRevealed(trackId, fullProfileHash);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == RECEIVER_INTERFACE_ID;
    }

    function getEntry(bytes32 trackId) external view returns (Entry memory) {
        return entries[trackId];
    }

    function getOwnerTracks(address owner) external view returns (bytes32[] memory) {
        return ownerTracks[owner];
    }

    // --- minimal ECDSA (no external dependency) ---

    function _ethSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}

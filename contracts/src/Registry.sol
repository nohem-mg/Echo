// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Registry {

    enum Status { SEALED, REVEALED, SIMILAR, REJECTED }

    struct Entry {
        bytes32 commitmentHash;
        uint256 worldNullifier;
        uint256 timestamp;
        Status  status;
        bytes32 registryRef;
    }

    bytes4 private constant RECEIVER_INTERFACE_ID =
        bytes4(keccak256("onReport(bytes,bytes)"));

    address public immutable creAddress;

    mapping(bytes32  => Entry)     public entries;
    mapping(address  => bytes32[]) public artistTracks;
    mapping(uint256  => bool)      public usedNullifiers;

    event TrackRegistered(address indexed artist, bytes32 indexed trackId, bytes32 commitmentHash, uint256 timestamp);
    event StatusUpdated(bytes32 indexed trackId, Status status);
    event TrackRevealed(bytes32 indexed trackId, bytes32 fullProfileHash);

    error NullifierAlreadyUsed();
    error TrackNotFound();
    error NotArtist();
    error InvalidStatus();
    error InvalidForwarder();

    constructor(address _creAddress) {
        creAddress = _creAddress;
    }

    function registerTrack(
        uint256 nullifier,
        bytes32 commitmentHash,
        bytes32 registryRef
    ) external returns (bytes32 trackId) {
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();
        usedNullifiers[nullifier] = true;

        trackId = keccak256(abi.encodePacked(msg.sender, commitmentHash, block.timestamp));

        entries[trackId] = Entry({
            commitmentHash: commitmentHash,
            worldNullifier: nullifier,
            timestamp:      block.timestamp,
            status:         Status.SEALED,
            registryRef:    registryRef
        });

        artistTracks[msg.sender].push(trackId);
        emit TrackRegistered(msg.sender, trackId, commitmentHash, block.timestamp);
    }

    function onReport(
        bytes calldata /* metadata */,
        bytes calldata rawReport
    ) external {
        require(msg.sender == creAddress, "Only CRE forwarder");

        (bytes32 trackId, uint8 verdictRaw) = abi.decode(
            rawReport, (bytes32, uint8)
        );

        if (entries[trackId].timestamp == 0) revert TrackNotFound();

        Status verdict = Status(verdictRaw);
        entries[trackId].status = verdict;
        emit StatusUpdated(trackId, verdict);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == RECEIVER_INTERFACE_ID;
    }



    function revealTrack(bytes32 trackId, bytes32 fullProfileHash) external {
        Entry storage entry = entries[trackId];
        if (entry.timestamp == 0) revert TrackNotFound();
        if (entry.status != Status.SEALED) revert InvalidStatus();

        bytes32[] storage tracks = artistTracks[msg.sender];
        bool isArtist;
        for (uint256 i; i < tracks.length; i++) {
            if (tracks[i] == trackId) { isArtist = true; break; }
        }
        if (!isArtist) revert NotArtist();

        entry.status = Status.REVEALED;
        emit TrackRevealed(trackId, fullProfileHash);
    }

    function getEntry(bytes32 trackId) external view returns (Entry memory) {
        return entries[trackId];
    }

    function getArtistTracks(address artist) external view returns (bytes32[] memory) {
        return artistTracks[artist];
    }
}

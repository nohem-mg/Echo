// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry registry;

    address cre = makeAddr("cre"); // Keystone forwarder

    // Ephemeral owner key (NOT the artist's real wallet). We need its private key to sign.
    uint256 ownerPk = 0xA11CE;
    address owner;

    bytes32 commitment  = keccak256("track-commitment");
    bytes32 registryRef = keccak256("registry-ref");

    function setUp() public {
        registry = new Registry(cre);
        owner = vm.addr(ownerPk);
    }

    function _seal(address _owner, bytes32 _commitment) internal returns (bytes32 trackId) {
        bytes memory report = abi.encode(_owner, _commitment, registryRef);
        vm.prank(cre);
        registry.onReport("", report);
        return keccak256(abi.encode(_owner, _commitment));
    }

    function _ownerSig(bytes32 trackId, bytes32 profileHash) internal view returns (bytes memory) {
        bytes32 inner = keccak256(abi.encode(trackId, profileHash));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_onReport_createsAndSealsAtomically() public {
        bytes32 trackId = _seal(owner, commitment);
        Registry.Entry memory e = registry.getEntry(trackId);
        assertEq(e.commitmentHash, commitment);
        assertEq(e.owner, owner);
        assertEq(uint8(e.status), uint8(Registry.Status.SEALED));
        assertTrue(e.timestamp > 0);
        assertEq(registry.getOwnerTracks(owner)[0], trackId);
    }

    function test_onReport_onlyForwarder() public {
        bytes memory report = abi.encode(owner, commitment, registryRef);
        vm.prank(makeAddr("hacker"));
        vm.expectRevert("Only CRE forwarder");
        registry.onReport("", report);
    }

    function test_noEntryWithoutCre() public view {
        // The crux of requirement #1: with no onReport, the track simply does not exist.
        bytes32 trackId = keccak256(abi.encode(owner, commitment));
        assertEq(registry.getEntry(trackId).timestamp, 0);
    }

    function test_onReport_idempotent() public {
        _seal(owner, commitment);
        bytes memory report = abi.encode(owner, commitment, registryRef);
        vm.prank(cre);
        vm.expectRevert(Registry.AlreadyRegistered.selector);
        registry.onReport("", report);
    }

    function test_deterministicTrackId() public {
        bytes32 trackId = _seal(owner, commitment);
        assertEq(trackId, keccak256(abi.encode(owner, commitment)));
    }

    function test_revealTrack_withOwnerSignature() public {
        bytes32 trackId = _seal(owner, commitment);
        bytes32 profileHash = keccak256("full-profile");
        // Anyone may relay the tx; authorization comes from the signature, not msg.sender.
        vm.prank(makeAddr("relayer"));
        registry.revealTrack(trackId, profileHash, _ownerSig(trackId, profileHash));
        assertEq(uint8(registry.getEntry(trackId).status), uint8(Registry.Status.REVEALED));
    }

    function test_revealTrack_wrongSigner_reverts() public {
        bytes32 trackId = _seal(owner, commitment);
        bytes32 profileHash = keccak256("full-profile");
        // Sign with a different key.
        bytes32 inner = keccak256(abi.encode(trackId, profileHash));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest);
        vm.expectRevert(Registry.NotOwner.selector);
        registry.revealTrack(trackId, profileHash, abi.encodePacked(r, s, v));
    }

    function test_revealTrack_unknown_reverts() public {
        bytes32 trackId = keccak256(abi.encode(owner, commitment));
        vm.expectRevert(Registry.TrackNotFound.selector);
        registry.revealTrack(trackId, keccak256("x"), _ownerSig(trackId, keccak256("x")));
    }

    function test_revealTrack_cannotRevealTwice() public {
        bytes32 trackId = _seal(owner, commitment);
        bytes32 profileHash = keccak256("full-profile");
        registry.revealTrack(trackId, profileHash, _ownerSig(trackId, profileHash));
        vm.expectRevert(Registry.InvalidStatus.selector);
        registry.revealTrack(trackId, profileHash, _ownerSig(trackId, profileHash));
    }

    function test_supportsInterface_receiver() public view {
        bytes4 receiverInterfaceId = bytes4(keccak256("onReport(bytes,bytes)"));
        assertTrue(registry.supportsInterface(receiverInterfaceId));
    }
}

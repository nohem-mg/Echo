// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry registry;

    address artist = makeAddr("artist");
    address hacker = makeAddr("hacker");
    address cre = makeAddr("cre");

    uint256 nullifier   = 123456789;
    bytes32 commitment  = keccak256("track-commitment");
    bytes32 registryRef = keccak256("registry-ref");

    function setUp() public {
        registry = new Registry(cre);
    }

    function _register(address user) internal returns (bytes32) {
        vm.prank(user);
        return registry.registerTrack(nullifier, commitment, registryRef);
    }

    function test_registerTrack_success() public {
        bytes32 trackId = _register(artist);
        Registry.Entry memory e = registry.getEntry(trackId);
        assertEq(e.commitmentHash, commitment);
        assertEq(e.worldNullifier, nullifier);
        assertEq(uint8(e.status), uint8(Registry.Status.SEALED));
        assertTrue(e.timestamp > 0);
    }

    function test_registerTrack_duplicateNullifier_reverts() public {
        _register(artist);
        vm.prank(hacker);
        vm.expectRevert(Registry.NullifierAlreadyUsed.selector);
        registry.registerTrack(nullifier, keccak256("other"), registryRef);
    }

    function test_CRECallback_wrongCaller_reverts() public {
        bytes32 trackId = _register(artist);
        vm.prank(hacker);
        vm.expectRevert("Only CRE forwarder");
        registry.route(bytes32(0), address(0), address(0), "", abi.encode(trackId, uint8(Registry.Status.SIMILAR)));
    }

    function test_CRECallback_success() public {
        bytes32 trackId = _register(artist);
        vm.prank(cre);
        bool success = registry.route(bytes32(0), address(0), address(0), "", abi.encode(trackId, uint8(Registry.Status.SIMILAR)));
        assertTrue(success);
        assertEq(
            uint8(registry.getEntry(trackId).status),
            uint8(Registry.Status.SIMILAR)
        );
    }

    function test_revealTrack_byArtist_success() public {
        bytes32 trackId = _register(artist);
        vm.prank(artist);
        registry.revealTrack(trackId, keccak256("full-profile"));
        assertEq(
            uint8(registry.getEntry(trackId).status),
            uint8(Registry.Status.REVEALED)
        );
    }

    function test_revealTrack_byThirdParty_reverts() public {
        bytes32 trackId = _register(artist);
        vm.prank(hacker);
        vm.expectRevert(Registry.NotArtist.selector);
        registry.revealTrack(trackId, keccak256("full-profile"));
    }
}

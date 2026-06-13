// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry, IReceiver} from "../src/Registry.sol";

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

    function test_route_wrongCaller_reverts() public {
        bytes32 trackId = _register(artist);
        bytes memory report = abi.encode(trackId, uint8(2));

        vm.prank(hacker);
        vm.expectRevert(Registry.InvalidForwarder.selector);
        registry.route(bytes32(0), address(0), address(0), "", report);
    }

    function test_route_success() public {
        bytes32 trackId = _register(artist);
        bytes memory report = abi.encode(trackId, uint8(2));

        vm.prank(cre);
        bool ok = registry.route(bytes32(0), address(0), address(0), "", report);

        assertTrue(ok);
        assertEq(uint8(registry.getEntry(trackId).status), uint8(Registry.Status.SIMILAR));
    }

    function test_onReport_success() public {
        bytes32 trackId = _register(artist);
        bytes memory report = abi.encode(trackId, uint8(2));

        vm.prank(cre);
        registry.onReport("", report);

        assertEq(uint8(registry.getEntry(trackId).status), uint8(Registry.Status.SIMILAR));
    }

    function test_onReport_wrongCaller_reverts() public {
        bytes32 trackId = _register(artist);
        bytes memory report = abi.encode(trackId, uint8(2));

        vm.prank(hacker);
        vm.expectRevert(Registry.InvalidForwarder.selector);
        registry.onReport("", report);
    }

    function test_supportsInterface_receiver() public view {
        assertTrue(registry.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(registry.supportsInterface(0x01ffc9a7));
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

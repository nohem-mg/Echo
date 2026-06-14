// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LicenseEscrow} from "../src/LicenseEscrow.sol";

/// Deploys LicenseEscrow wired to the live Registry and the Unlink ERC-20 (ULNKMock) on
/// Ethereum Sepolia. Addresses are read from env with sane defaults for this deployment.
contract DeployEscrow is Script {
    // Live Echo Registry (Ethereum Sepolia).
    address constant DEFAULT_REGISTRY = 0x0E0f9A9e1D5d5825F7590E04EbBcAdBFB8365148;
    // Unlink token (ULNKMock) on Ethereum Sepolia.
    address constant DEFAULT_TOKEN = 0x1df1077B9691A597A17B5Eb398E43efEc3CD8559;

    function run() external {
        address registry = vm.envOr("ESCROW_REGISTRY", DEFAULT_REGISTRY);
        address token = vm.envOr("ESCROW_TOKEN", DEFAULT_TOKEN);

        vm.startBroadcast();
        LicenseEscrow escrow = new LicenseEscrow(registry, token);
        vm.stopBroadcast();

        console.log("LicenseEscrow deployed at:", address(escrow));
        console.log("  registry:", registry);
        console.log("  token:   ", token);
    }
}

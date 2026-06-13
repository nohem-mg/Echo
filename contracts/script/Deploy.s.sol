// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";

contract Deploy is Script {
    function run() external {
        address cre = vm.envAddress("CRE_CALLER_ADDRESS");

        vm.startBroadcast();
        Registry registry = new Registry(cre);
        vm.stopBroadcast();

        console.log("Registry deployed at:", address(registry));
    }
}

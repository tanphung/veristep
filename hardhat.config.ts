import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";

export default defineConfig({
  plugins: [hardhatViem],
  paths: { sources: ["./contracts", "./tests/evm"] },
  solidity: {
    profiles: {
      default: {
        version: "0.8.37",
        settings: { viaIR: true, optimizer: { enabled: true, runs: 200 } },
      },
    },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
  },
});

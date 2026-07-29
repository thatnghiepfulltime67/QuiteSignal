import { defineConfig } from 'hardhat/config';

export default defineConfig({
  solidity: {
    profiles: {
      default: {
        version: '0.8.35',
        settings: {
          evmVersion: 'cancun',
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
});

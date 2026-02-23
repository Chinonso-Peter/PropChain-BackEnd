// providers/provider.factory.ts
import { JsonRpcProvider } from 'ethers';
import { SupportedChain } from '../enums/supported-chain.enum';

export class ProviderFactory {
  static create(chain: SupportedChain): JsonRpcProvider {
    const rpcMap = {
      ethereum: process.env.ETH_RPC,
      polygon: process.env.POLYGON_RPC,
      bsc: process.env.BSC_RPC,
    };

    const rpcUrl = rpcMap[chain];
    if (!rpcUrl) throw new Error(`RPC not configured for ${chain}`);

    return new JsonRpcProvider(rpcUrl);
  }
}
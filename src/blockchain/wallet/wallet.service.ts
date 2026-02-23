import { ethers, Wallet } from 'ethers';
import { SupportedChain } from '../enums/supported-chain.enum';
import { ProviderFactory } from '../providers/provider.factory';

export class WalletService {
  static getWallet(chain: SupportedChain) {
    const provider = ProviderFactory.create(chain);
    return new Wallet(process.env.PRIVATE_KEY, provider);
  }

  async sendTransaction(chain: SupportedChain, to: string, value: string) {
    const wallet = WalletService.getWallet(chain);
    const provider = this.getProvider(chain);

    const feeData = await provider.getFeeData();

    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(value),
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    return tx;
  }

  async getContract(chain: SupportedChain, address: string, abi: any) {
    const wallet = WalletService.getWallet(chain);
    return new ethers.Contract(address, abi, wallet);
  }

  async listenToEvent(
    chain: SupportedChain,
    contractAddress: string,
    abi: any,
    eventName: string,
    callback: (data: any) => void,
  ) {
    const provider = this.getProvider(chain);
    const contract = new ethers.Contract(contractAddress, abi, provider);

    contract.on(eventName, (...args) => {
      callback(args);
    });
  }

  async syncBlocks(chain: SupportedChain) {
    const provider = this.getProvider(chain);
    const latest = await provider.getBlockNumber();

    // store latest block in DB
    // process missed events
  }
  async batchTransactions(chain: SupportedChain, txs: Array<{ to: string; value: string }>) {
    const wallet = WalletService.getWallet(chain);

    return Promise.all(
      txs.map(tx =>
        wallet.sendTransaction({
          to: tx.to,
          value: ethers.parseEther(tx.value),
        }),
      ),
    );
  }

  async checkHealth() {
    const results = [];

    for (const chain of Object.values(SupportedChain)) {
      try {
        const status = await this.getNetworkStatus(chain);
        results.push(status);
      } catch {
        results.push({
          chain,
          healthy: false,
        });
      }
    }

    return results;
  }
}

import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

@Injectable()
export class BlockchainHealthIndicator extends HealthIndicator {
  private provider: ethers.JsonRpcProvider;

  constructor(private configService: ConfigService) {
    super();
    const rpcUrl = this.configService.get<string>('RPC_URL', 'https://eth-mainnet.alchemyapi.io/v2/demo');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    try {
      // Test basic connectivity
      const blockNumber = await this.provider.getBlockNumber();
      const network = await this.provider.getNetwork();
      
      // Test gas price fetching
      const gasPrice = await this.provider.getFeeData();
      
      // Test block retrieval
      const latestBlock = await this.provider.getBlock('latest');
      
      // Test balance query (using a known address)
      const testAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45'; // Example address
      const balance = await this.provider.getBalance(testAddress);
      
      const responseTime = Date.now() - startTime;

      const details = {
        responseTime: `${responseTime}ms`,
        network: {
          name: network.name,
          chainId: network.chainId.toString(),
        },
        block: {
          number: blockNumber,
          timestamp: latestBlock?.timestamp,
          hash: latestBlock?.hash,
          gasLimit: latestBlock?.gasLimit?.toString(),
          gasUsed: latestBlock?.gasUsed?.toString(),
        },
        gas: {
          gasPrice: gasPrice.gasPrice?.toString(),
          maxFeePerGas: gasPrice.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas?.toString(),
        },
        test: {
          address: testAddress,
          balance: ethers.formatEther(balance),
        },
        timestamp: new Date().toISOString(),
        message: 'Blockchain connection successful',
      };

      return this.getStatus(key, true, details);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      throw new HealthCheckError(
        'Blockchain connection failed',
        this.getStatus(key, false, {
          error: error.message,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}

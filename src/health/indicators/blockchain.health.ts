import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

@Injectable()
export class BlockchainHealthIndicator extends HealthIndicator {
  private provider: ethers.JsonRpcProvider;

  constructor(private configService: ConfigService) {
    super();
    const rpcUrl = this.configService.get<string>('RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const network = await this.provider.getNetwork();

      return this.getStatus(key, true, {
        message: 'Blockchain connection successful',
        blockNumber,
        network: {
          name: network.name,
          chainId: network.chainId.toString(),
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError('Blockchain connection failed', this.getStatus(key, false, { error: errMsg }));
    }
  }
}

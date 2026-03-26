import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DependencyConfig {
  name: string;
  url: string;
  timeout?: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  expectedStatus?: number;
}

@Injectable()
export class DependenciesHealthIndicator extends HealthIndicator {
  private dependencies: DependencyConfig[] = [];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    super();
    this.loadDependencies();
  }

  private loadDependencies(): void {
    // Load dependencies from environment variables or config
    const configDeps = this.configService.get<DependencyConfig[]>('HEALTH_CHECK_DEPENDENCIES', []);
    
    // Default dependencies to check
    const defaultDependencies: DependencyConfig[] = [
      {
        name: 'valuation-provider',
        url: 'https://api.valuation-service.com/v1/health',
        timeout: 5000,
        method: 'GET',
        expectedStatus: 200,
      },
      {
        name: 'blockchain-rpc',
        url: this.configService.get('RPC_URL', 'https://eth-mainnet.alchemyapi.io/v2/demo'),
        timeout: 3000,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    ];

    this.dependencies = [...defaultDependencies, ...configDeps];
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const results: Record<string, any> = {};
    let allHealthy = true;

    for (const dependency of this.dependencies) {
      try {
        const startTime = Date.now();
        const result = await this.checkDependency(dependency);
        const responseTime = Date.now() - startTime;

        results[dependency.name] = {
          status: 'healthy',
          url: dependency.url,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
          ...result,
        };
      } catch (error) {
        allHealthy = false;
        results[dependency.name] = {
          status: 'unhealthy',
          url: dependency.url,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const healthyCount = Object.values(results).filter((r: any) => r.status === 'healthy').length;
    const totalCount = Object.keys(results).length;

    const details = {
      totalDependencies: totalCount,
      healthyDependencies: healthyCount,
      unhealthyDependencies: totalCount - healthyCount,
      dependencies: results,
    };

    if (allHealthy) {
      return this.getStatus(key, true, details);
    } else {
      throw new HealthCheckError(
        `${totalCount - healthyCount} dependencies are unhealthy`,
        this.getStatus(key, false, details)
      );
    }
  }

  private async checkDependency(dependency: DependencyConfig): Promise<any> {
    const timeout = dependency.timeout || 5000;
    const method = dependency.method || 'GET';
    const expectedStatus = dependency.expectedStatus || 200;

    const config = {
      method,
      url: dependency.url,
      timeout,
      headers: dependency.headers || {},
      ...(method === 'POST' ? { data: { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 } } : {}),
    };

    try {
      const response = await firstValueFrom(this.httpService.request(config));
      
      if (response.status !== expectedStatus) {
        throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
      }

      return {
        statusCode: response.status,
        statusText: response.statusText,
        data: dependency.name === 'blockchain-rpc' ? response.data : undefined,
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  getDependencies(): DependencyConfig[] {
    return this.dependencies;
  }

  addDependency(dependency: DependencyConfig): void {
    this.dependencies.push(dependency);
  }

  removeDependency(name: string): void {
    this.dependencies = this.dependencies.filter(dep => dep.name !== name);
  }
}

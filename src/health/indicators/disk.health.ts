import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class DiskHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const stats = await fs.stat(process.cwd());
      
      // For Windows, we'll use a simple check by trying to write a temp file
      const tempFile = path.join(process.cwd(), '.health-check-temp');
      const testData = 'health-check';
      
      await fs.writeFile(tempFile, testData);
      await fs.unlink(tempFile);
      
      // Get disk space (simplified approach)
      const os = require('os');
      const platform = os.platform();
      
      let diskInfo = {};
      
      if (platform === 'win32') {
        // Windows-specific disk space check would require additional dependencies
        // For now, we'll just verify write capability
        diskInfo = {
          writeAccess: true,
          platform: 'windows',
          note: 'Detailed disk space monitoring requires additional dependencies',
        };
      } else {
        // Unix-like systems can use statvfs
        diskInfo = {
          writeAccess: true,
          platform: platform,
        };
      }
      
      return this.getStatus(key, true, diskInfo);
    } catch (error) {
      throw new HealthCheckError('Disk health check failed', this.getStatus(key, false, { error: error.message }));
    }
  }
}

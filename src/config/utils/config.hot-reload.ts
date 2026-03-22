import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

@Injectable()
export class ConfigHotReloadService extends EventEmitter {
  private readonly logger = new Logger(ConfigHotReloadService.name);
  private watchers: fs.FSWatcher[] = [];
  private configCache = new Map<string, any>();
  private lastModified = new Map<string, Date>();

  constructor(private readonly configService: ConfigService) {
    super();
  }

  /**
   * Start watching configuration files for changes
   */
  startWatching(): void {
    const configFiles = this.getConfigFiles();

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        this.watchConfigFile(configFile);
      }
    }

    this.logger.log(`Started watching ${configFiles.length} configuration files`);
  }

  /**
   * Stop watching configuration files
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.logger.log('Stopped watching configuration files');
  }

  /**
   * Get list of configuration files to watch
   */
  private getConfigFiles(): string[] {
    const files = ['.env', '.env.local', '.env.development', '.env.staging', '.env.production'];

    const baseDir = process.cwd();
    return files.map(file => path.join(baseDir, file));
  }

  /**
   * Watch a specific configuration file
   */
  private watchConfigFile(filePath: string): void {
    const watcher = fs.watch(filePath, (eventType, filename) => {
      if (eventType === 'change') {
        this.handleConfigChange(filePath);
      }
    });

    this.watchers.push(watcher);

    // Store initial modification time
    const stats = fs.statSync(filePath);
    this.lastModified.set(filePath, stats.mtime);

    this.logger.debug(`Watching configuration file: ${filePath}`);
  }

  /**
   * Handle configuration file changes
   */
  private handleConfigChange(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const lastMod = this.lastModified.get(filePath);

      // Avoid duplicate events
      if (lastMod && stats.mtime <= lastMod) {
        return;
      }

      this.lastModified.set(filePath, stats.mtime);

      // Read and parse the new configuration
      const newConfig = this.parseConfigFile(filePath);
      const oldConfig = this.configCache.get(filePath) || {};

      // Detect changes
      const changes = this.detectChanges(oldConfig, newConfig);

      if (changes.length > 0) {
        this.logger.log(`Configuration changes detected in ${filePath}:`);
        changes.forEach(change => {
          this.logger.log(`  ${change.key}: ${change.oldValue} → ${change.newValue}`);
        });

        // Update cache
        this.configCache.set(filePath, newConfig);

        // Emit change event
        this.emit('configChanged', {
          file: filePath,
          changes,
          timestamp: new Date(),
        });

        // Notify configuration service to reload
        this.notifyConfigReload(filePath, changes);
      }
    } catch (error) {
      this.logger.error(
        `Error handling config change for ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Parse configuration file
   */
  private parseConfigFile(filePath: string): Record<string, string> {
    const content = fs.readFileSync(filePath, 'utf8');
    const config: Record<string, string> = {};

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim();
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          config[key] = cleanValue;
        }
      }
    }

    return config;
  }

  /**
   * Detect changes between old and new configuration
   */
  private detectChanges(
    oldConfig: Record<string, string>,
    newConfig: Record<string, string>,
  ): Array<{
    key: string;
    oldValue: string;
    newValue: string;
    type: 'added' | 'modified' | 'deleted';
  }> {
    const changes: Array<{
      key: string;
      oldValue: string;
      newValue: string;
      type: 'added' | 'modified' | 'deleted';
    }> = [];

    // Check for modified and added values
    for (const [key, newValue] of Object.entries(newConfig)) {
      const oldValue = oldConfig[key];
      if (oldValue === undefined) {
        changes.push({ key, oldValue: '', newValue, type: 'added' });
      } else if (oldValue !== newValue) {
        changes.push({ key, oldValue, newValue, type: 'modified' });
      }
    }

    // Check for deleted values
    for (const key of Object.keys(oldConfig)) {
      if (!(key in newConfig)) {
        changes.push({ key, oldValue: oldConfig[key], newValue: '', type: 'deleted' });
      }
    }

    return changes;
  }

  /**
   * Notify configuration service to reload
   */
  private notifyConfigReload(filePath: string, changes: any[]): void {
    // This would typically trigger a configuration reload in the main config service
    // For now, we'll just emit the event and let other services handle it
    this.emit('reloadRequired', { file: filePath, changes });
  }

  /**
   * Get current configuration cache
   */
  getConfigCache(): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const [file, config] of this.configCache.entries()) {
      result[file] = config;
    }
    return result;
  }

  /**
   * Force reload of all configuration files
   */
  forceReload(): void {
    const configFiles = this.getConfigFiles();

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        this.handleConfigChange(configFile);
      }
    }

    this.logger.log('Force reloaded all configuration files');
  }
}

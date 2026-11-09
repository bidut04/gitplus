import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AgentConfigFile {
  backendUrl: string;
  installationId?: string;
  token?: string;
  monitoredFolders: string[];
  scanIntervalSeconds: number;
  autoFetchEnabled: boolean;
}

const DEFAULT_CONFIG: AgentConfigFile = {
  backendUrl: 'http://localhost:4000',
  monitoredFolders: [],
  scanIntervalSeconds: 60,
  autoFetchEnabled: false
};

export class AgentConfigManager {
  private configDir: string;
  private configPath: string;

  constructor(customPath?: string) {
    this.configDir = customPath || path.join(os.homedir(), '.gitpulse');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  loadConfig(): AgentConfigFile {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch { }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(updates: Partial<AgentConfigFile>): AgentConfigFile {
    const current = this.loadConfig();
    const updated = { ...current, ...updates };
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  addMonitoredFolder(folderPath: string): string[] {
    const absPath = path.resolve(folderPath);
    const config = this.loadConfig();
    if (!config.monitoredFolders.includes(absPath)) {
      config.monitoredFolders.push(absPath);
      this.saveConfig(config);
    }
    return config.monitoredFolders;
  }
}


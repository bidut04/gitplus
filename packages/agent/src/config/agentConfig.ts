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

export interface IAgentConfigManager {
  loadConfig: () => AgentConfigFile;
  saveConfig: (updates: Partial<AgentConfigFile>) => AgentConfigFile;
  addMonitoredFolder: (folderPath: string) => string[];
}

export const createAgentConfigManager = (customPath?: string): IAgentConfigManager => {
  const configDir = customPath || path.join(os.homedir(), '.gitpulse');
  const configPath = path.join(configDir, 'config.json');

  const loadConfig = (): AgentConfigFile => {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch { }
    return { ...DEFAULT_CONFIG };
  };

  const saveConfig = (updates: Partial<AgentConfigFile>): AgentConfigFile => {
    const current = loadConfig();
    const updated = { ...current, ...updates };
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  };

  const addMonitoredFolder = (folderPath: string): string[] => {
    const absPath = path.resolve(folderPath);
    const config = loadConfig();
    if (!config.monitoredFolders.includes(absPath)) {
      config.monitoredFolders.push(absPath);
      saveConfig(config);
    }
    return config.monitoredFolders;
  };

  return {
    loadConfig,
    saveConfig,
    addMonitoredFolder
  };
};

export type AgentConfigManager = IAgentConfigManager;

export const AgentConfigManager = function (this: any, customPath?: string) {
  return createAgentConfigManager(customPath);
} as unknown as {
  new (customPath?: string): AgentConfigManager;
  (customPath?: string): AgentConfigManager;
};

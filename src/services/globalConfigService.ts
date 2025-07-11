import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { InfrastructureResources } from "../types";
import inquirer from "inquirer";

interface AsobiApp {
  name: string;
  uniqueId: string;
  resources: InfrastructureResources;
  createdAt: string;
  updatedAt: string;
}

interface GlobalConfig {
  apps: AsobiApp[];
  version: string;
}

export class GlobalConfigService {
  private readonly configPath: string;
  private config: GlobalConfig;

  constructor() {
    // Create .asobi directory in home folder if it doesn't exist
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const asobiDir = join(homeDir!, ".asobi");
    if (!existsSync(asobiDir)) {
      mkdirSync(asobiDir, { recursive: true });
    }
    this.configPath = join(asobiDir, "config.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): GlobalConfig {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, "utf-8");
        return JSON.parse(content);
      } catch (error) {
        console.error("Error reading config file:", error);
        return this.createDefaultConfig();
      }
    }
    return this.createDefaultConfig();
  }

  private createDefaultConfig(): GlobalConfig {
    return {
      apps: [],
      version: "1.0.0",
    };
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Error saving config file:", error);
      throw new Error("Failed to save global config");
    }
  }

  public async addApp(
    name: string,
    uniqueId: string,
    resources: InfrastructureResources
  ): Promise<void> {
    // Check for app name collision
    if (this.config.apps.some((app) => app.name === name)) {
      throw new Error(`App with name "${name}" already exists`);
    }

    const newApp: AsobiApp = {
      name,
      uniqueId,
      resources,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.config.apps.push(newApp);
    this.saveConfig();
  }

  public async updateApp(
    name: string,
    resources: InfrastructureResources
  ): Promise<void> {
    const appIndex = this.config.apps.findIndex((app) => app.name === name);
    if (appIndex === -1) {
      throw new Error(`App with name "${name}" not found`);
    }

    this.config.apps[appIndex] = {
      ...this.config.apps[appIndex],
      resources,
      updatedAt: new Date().toISOString(),
    };

    this.saveConfig();
  }

  public async removeApp(name: string): Promise<void> {
    const appIndex = this.config.apps.findIndex((app) => app.name === name);
    if (appIndex === -1) {
      throw new Error(`App with name "${name}" not found`);
    }

    this.config.apps.splice(appIndex, 1);
    this.saveConfig();
  }

  public async getApp(name: string): Promise<AsobiApp | null> {
    return this.config.apps.find((app) => app.name === name) || null;
  }

  public async getAllApps(): Promise<AsobiApp[]> {
    return this.config.apps;
  }

  public async purgeAllApps(): Promise<void> {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message:
          "Are you sure you want to purge all apps and their resources? This action cannot be undone.",
        default: false,
      },
    ]);

    if (!confirm) {
      console.log("Purge operation cancelled.");
      return;
    }

    this.config = this.createDefaultConfig();
    this.saveConfig();
    console.log("All apps have been purged from the global config.");
  }

  public async getAppResources(
    name: string
  ): Promise<InfrastructureResources | null> {
    const app = await this.getApp(name);
    return app?.resources || null;
  }
}

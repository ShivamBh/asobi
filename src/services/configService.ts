import { join } from "path";
import {
  Application,
  AwsCredentials,
  CredentialAnswers,
  InfrastructureConfig,
} from "../types";
import inquirer from "inquirer";
import { readFile, writeFile } from "fs/promises";
import { readFileSync } from "fs";

export class ConfigService {
  protected readonly configDir: string;
  private configFile: string;
  private awsCredentials: AwsCredentials | null = null;

  constructor() {
    this.configDir = join(process.cwd(), ".asobi");
    this.configFile = join(this.configDir, "asobi.json");
  }

  // Get aws credentials from object state or prompt
  async getAwsCredentials(): Promise<AwsCredentials> {
    if (this.awsCredentials) {
      return this.awsCredentials;
    }

    // Check env vars first
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
    const region = process.env.AWS_REGION || "";

    if (accessKeyId && secretAccessKey) {
      this.awsCredentials = {
        accessKeyId,
        secretAccessKey,
        region,
      };
      return this.awsCredentials;
    }

    // If env vars are not found, prompt user for input
    const answers = await inquirer.prompt<CredentialAnswers>([
      {
        type: "input",
        name: "accessKeyId",
        message: "Enter AWS Access Key ID:",
        validate: (input: string) =>
          input.length > 0 || "Access Key is required",
      },
      {
        type: "password",
        name: "secretAccessKey",
        message: "Enter AWS Secret Access Key",
        validate: (input: string) =>
          input.length > 0 || "Secret Access Key is required",
      },
      {
        type: "input",
        name: "region",
        message: "Enter AWS Region (e.g., us-east-1):",
        validate: (input: string) =>
          input.length > 0 || "AWS Region is required",
      },
    ]);

    this.awsCredentials = answers;
    return this.awsCredentials;
  }

  // List all asobi apps
  async listApps(): Promise<string> {
    try {
      const data: InfrastructureConfig = JSON.parse(
        await readFile(this.configFile, "utf-8")
      );
      return data.appName;
    } catch (e) {
      console.error(`Could not find any "asobi" apps`);
      return "";
      // process.exit(1)
    }
  }

  // Promp app name
  async promptForAppName(): Promise<string> {
    const answers = await inquirer.prompt<{ appName: string }>([
      {
        type: "input",
        name: "appName",
        message: "Enter application name",
        validate: (input: string) =>
          input.length > 0 || "Application name is required",
      },
    ]);

    return answers.appName;
  }

  // Prompt port
  async promptForPort(): Promise<number> {
    const answers = await inquirer.prompt<{ port: string }>([
      {
        type: "input",
        name: "port",
        message: "Enter the port your application will run on:",
        default: "3000",
        validate: (input: string) => {
          const port = parseInt(input);
          return (
            (!isNaN(port) && port > 0 && port < 65536) ||
            "Please enter a valid port number"
          );
        },
      },
    ]);

    return parseInt(answers.port);
  }

  // Update config file
  async updateConfigFile(input: InfrastructureConfig): Promise<void> {
    await writeFile(this.configFile, JSON.stringify(input));
  }

  // Read from config file
  async readFromConfigFile(): Promise<InfrastructureConfig> {
    return JSON.parse(await readFile(this.configFile, { encoding: "utf-8" }));
  }

  // Get config
  // async getConfig(appName: string): Promise<InfrastructureConfig | null>
}

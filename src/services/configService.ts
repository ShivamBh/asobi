import { join } from "path";
import { Application, AwsCredentials, CredentialAnswers } from "../types";
import inquirer from "inquirer";
import { readFile } from "fs/promises";

export class ConfigService {
  protected readonly configDir: string;
  protected readonly appsConfigPath: string;

  private awsCredentials: AwsCredentials | null = null;

  constructor() {
    this.configDir = join(process.cwd(), ".asobi");
    this.appsConfigPath = join(this.configDir, "apps.json");
  }

  // Get aws credentials from object state or prompt
  async getAwsCredentials(): Promise<AwsCredentials> {
    if (this.awsCredentials) {
      return this.awsCredentials;
    }

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
  async listApps(): Promise<string[]> {
    try {
      const data = await readFile(this.appsConfigPath, "utf-8");
      const apps: Application[] = JSON.parse(data);
      return apps.map((app) => app.name);
    } catch (e) {
      console.error(`Could not find any "asobi" apps`);
      return [];
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

  // Get config
  // async getConfig(appName: string): Promise<InfrastructureConfig | null>
}

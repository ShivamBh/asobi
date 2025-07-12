import { Command } from "commander";
import { existsSync, readFile } from "fs";
import { ConfigService } from "../services/configService";
import { InfrastructureConfig } from "../types";
import { join } from "path";
import { InfrastructureService } from "../services/infrastructureService";
import { mkdir, writeFile } from "fs/promises";

const program = new Command();

// TODO: add a config service class to interact with a global config file(maybe also local config file to be saved to vcs?)
const configService = new ConfigService();

/* Main "asobi" invocation */
program
  .command("asobi")
  .description("CLI to manage load-balanced EC2 instances")
  .version("0.1.0")
  .helpOption("-h, --help", "display help for commands");

/* 
  Initialize a asobi project. Creates a .asobi directory with a asobi.json file containing the project configurations if it does not exist.
*/

program
  .command("init")
  .description("Initialize an asobi project in this directory")
  .action(async () => {
    const currentDir = process.cwd();
    const configFilePath = currentDir + "/.asobi/asobi.json";
    try {
      // Check if .asobi exists otherwise create and add the asobi.json file to it.
      const asobiExists = existsSync(currentDir + "/.asobi");
      if (!asobiExists) {
        await mkdir(`${currentDir}/.asobi`);
        const basicConfig = {
          appname: "string",
          vpc: "something",
        };
        await writeFile(configFilePath, JSON.stringify(basicConfig));
        console.log("Created project config file at", configFilePath);
        process.exit(1);
      }
      console.log("Found existing config file at", configFilePath);
    } catch (e) {
      console.error(`Error`, e);
      process.exit(1);
    }
  });

/* 
  List all asobi applications or details of specific asobi app
*/
program
  .command("ls")
  .description("List all applications created with asobi")
  .argument("[app-name]", "Name of the application to show details for")
  .action(async (appName?: string) => {
    try {
      const awsCredentials = await configService.getAwsCredentials();
    } catch (e) {
      console.error(`Error `);
    }
  });

/* Create a new asobi application */
program
  .command("create")
  .description("Create a new application")
  .option("-p, --path <path>", "Path to the codebase directory")
  .option(
    "--type <type>",
    "Application type(empty or load-balanced-web-service)",
    "empty"
  )
  .action(async (options) => {
    const awsCredentials = await configService.getAwsCredentials();
    const appName = await configService.promptForAppName();

    const config: InfrastructureConfig = {
      appName,
      region: awsCredentials.region,
      accessKeyId: awsCredentials.accessKeyId,
      secretAccessKey: awsCredentials.secretAccessKey,
      instanceType: "t2.micro",
    };

    // Handle codebase path if provided
    if (options.path) {
      const codebasePath = options.path;
      if (!existsSync(codebasePath)) {
        console.error(`Error: Path ${codebasePath} does not exist`);
        process.exit(1);
      }

      config.codebasePath = codebasePath;

      // Check if its a Nodejs project
      config.isNodeProject = existsSync(join(codebasePath, "package.json"));
      if (config.isNodeProject) {
        console.log("Detected Node.js project");
      }
    }

    // Handle application type[empty or load-balanced(can add more later like cron or background job etc?)]
    if (
      options.type &&
      !["empty", "load-balanced-web-service"].includes(options.type)
    ) {
      console.error(
        "Error: Type must be either 'empty' or 'load-balanced-web-service'"
      );
      process.exit();
    }

    if (config.type === "load-balanced-web-service") {
      const port = await configService.promptForPort();
      config.port = port;

      // TODO: Enable passing run commands inside the provisioned server
      // const runCommand = await configService.promptForRunCommand()
      // config.runCommand = runCommand
    }
    const infrastructureService = new InfrastructureService(config);
    const result = await infrastructureService.createInfrastructure();

    if (result.success) {
      console.log("Application created successfully");
      if (result.resources) {
        console.log("Resources created: ", result.resources);
      }
    } else {
      console.log("Failed to create application", result.error);
      process.exit(1);
    }
  });

/* View the status of an asobi application */
program
  .command("status")
  .description("Check application status")
  .argument("<app-name>", "Name of the application");

/* Delete and cleanup resources of an asobi application */
program
  .command("delete")
  .description("Delete an application")
  .argument("<app-name>", "Name of the application");

export async function main(args: string[]): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
      program.help();
    } else {
      await program.parseAsync(argv);
    }
  } catch (e) {
    console.error(`Error: `, e);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("Fatal error: ", error);
    process.exit(1);
  });
}

// export for bin/asobi script
export { program };

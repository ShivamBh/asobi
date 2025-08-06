import dotenv from "dotenv";
import { Command } from "commander";
import { existsSync, readFile } from "fs";
import { ConfigService } from "../services/configService";
import { InfrastructureConfig } from "../types";
import { join } from "path";
import { InfrastructureService } from "../services/infrastructureService";
import { mkdir, writeFile } from "fs/promises";
import { checkIfAsobiProject } from "../utls/checkIfAsobiProject";
import inquirer from "inquirer";
import { DescribeSubnetsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { generateConfigTemplate } from "../utls/generateConfigTemplate";

dotenv.config();
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
  List all asobi applications or details of specific asobi app
*/
program
  .command("ls")
  .description("List all applications created with asobi")
  .argument("[app-name]", "Name of the application to show details for")
  .action(async (appName?: string) => {
    try {
      const awsCredentials = await configService.getAwsCredentials();
      const command = new DescribeSubnetsCommand({
        Filters: [
          {
            Name: "vpc-id",
            Values: ["vpc-0c1491ac08b3b9c85"],
          },
        ],
      });
    } catch (e) {
      console.error(`Error `);
    }
  });

/* Create a new asobi application */
program
  .command("create")
  .description("Create a new application")
  .action(async (options) => {
    let config: InfrastructureConfig;
    const defaultConfig = generateConfigTemplate();

    // Load existing config if present
    const initAsobiConfig = await checkIfAsobiProject();
    const awsCredentials = await configService.getAwsCredentials();

    // Merge credentials into config
    config = {
      ...defaultConfig,
      ...(initAsobiConfig || {}),
      accessKeyId: awsCredentials.accessKeyId,
      secretAccessKey: awsCredentials.secretAccessKey,
      region: awsCredentials.region,
    };

    // Prompt for missing required fields
    if (!config.appName) {
      config.appName = await configService.promptForAppName();
    }
    if (!config.instanceType) {
      config.instanceType = "t2.micro";
    }
    if (!config.amiId) {
      // You can prompt for AMI or set a sensible default
      config.amiId = "ami-0e670eb768a5fc3d4";
    }
    if (!config.keyName) {
      config.keyName = "default-key-pair";
    }
    if (!config.domain) {
      // Optionally prompt for domain or leave as empty string
      config.domain = "";
    }

    // Set codebase path and isNodeProject
    config.codebasePath = process.cwd();
    config.isNodeProject = false;

    // Optionally, prompt for port if not set
    if (!config.port) {
      config.port = await configService.promptForPort();
    }

    // Save the fully populated config back to disk
    await configService.updateConfigFile(config);

    // Proceed with infrastructure creation
    console.log("config before creating", config);
    const infrastructureService = new InfrastructureService(
      config,
      configService
    );
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

/* View the status of an asobi  application */
program
  .command("status")
  .description("Check application status")
  .action(async () => {
    try {
      const initAsobiConfig = await checkIfAsobiProject();
      if (!initAsobiConfig) {
        console.log(
          "No asobi project found. You can create one using 'asobi create' to get started."
        );
        process.exit(1);
      }
      const awsCredentials = await configService.getAwsCredentials();
      const config: InfrastructureConfig = {
        ...initAsobiConfig,
        accessKeyId: awsCredentials.accessKeyId,
        region: awsCredentials.region,
        secretAccessKey: awsCredentials.secretAccessKey,
      };
      const infrastructure = new InfrastructureService(config, configService);

      const resourceDetails = await infrastructure.fetchResourcesStatus();

      console.log("\n===== Asobi App =====");
      console.log("AppName: ", initAsobiConfig.appName);
      console.log("\n");

      console.log("===== EC2 Instance ====");
      console.log("InstanceId: ", resourceDetails.ec2?.InstanceId);
      console.log("Status: ", resourceDetails.ec2?.State?.Name);
      console.log("ImageId: ", resourceDetails.ec2?.ImageId);
      console.log("InstanceType: ", resourceDetails.ec2?.InstanceType);
      console.log("KeyName: ", resourceDetails.ec2?.KeyName);
      console.log("\n");

      console.log("===== VPC =====");
      console.log("VpcId: ", resourceDetails.vpc?.VpcId);
      console.log("State: ", resourceDetails.vpc?.State);
      console.log("CIDRBlock: ", resourceDetails.vpc?.CidrBlock);
      console.log("\n");

      console.log("===== Load Balancer =====");
      console.log("LoadBalancerUrl: ", resourceDetails.alb?.DNSName);
      console.log("Type: ", resourceDetails.alb?.Type);
      console.log("Arn: ", resourceDetails.alb?.LoadBalancerArn);
    } catch (e) {
      console.log(
        `An error occured while fetching the status of the deployed resources`
      );
    }
  });

/* Delete and cleanup resources of an asobi application */
program
  .command("delete")
  .description("Delete an application")
  .action(async () => {
    try {
      const initAsobiConfig = await checkIfAsobiProject();
      if (!initAsobiConfig) {
        console.log(
          "No asobi project found. You can create one using 'asobi create' to get started."
        );
        process.exit(1);
      }
      const awsCredentials = await configService.getAwsCredentials();
      const config: InfrastructureConfig = {
        ...initAsobiConfig,
        accessKeyId: awsCredentials.accessKeyId,
        region: awsCredentials.region,
        secretAccessKey: awsCredentials.secretAccessKey,
      };
      const infrastructure = new InfrastructureService(config, configService);

      console.log(
        "The following resources will be deleted on confirmation\n",
        config
      );

      // Prompt for confirmation before proceeding with deletion
      const answer = await inquirer.prompt<{ confirmDelete: boolean }>([
        {
          type: "confirm",
          name: "confirmDelete",
          message:
            "Are you sure you want to delete this project. On confirmation all the resources listed above will be terminated",
        },
      ]);

      if (answer.confirmDelete) {
        // Start deletion
        console.log("===== Deleting Infrastructure====");
        await infrastructure.deleteInfrastructure();
      }
      console.log("=====Finished Deletion======");
    } catch (e) {
      console.error("Failed to delete resources", e);
      process.exit(1);
    }
  });

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

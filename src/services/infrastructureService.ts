import { EC2Client } from "@aws-sdk/client-ec2";
import { IAMClient } from "@aws-sdk/client-iam";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  InfrastructureConfig,
  InfrastructureResources,
  CreateInfrastructureResponse,
  DeleteInfrastructureResponse,
} from "../types";
import { VpcService } from "./VpcService";
import { SubnetService } from "./SubnetService";
import { SecurityGroupService } from "./SecurityGroupService";
import { EC2Service } from "./EC2Service";
import { IAMService } from "./IAMService";
import { ALBService } from "./ALBService";
import { nanoid } from "nanoid";
import inquirer from "inquirer";
import { InfrastructureError } from "../utls/errors";
import { GlobalConfigService } from "./globalConfigService";
import { CIDRService } from "./CIDRService";

export class InfrastructureService {
  private readonly config: InfrastructureConfig;
  private readonly uniqueId: string;
  private readonly vpcService: VpcService;
  private readonly subnetService: SubnetService;
  private readonly securityGroupService: SecurityGroupService;
  private readonly ec2Service: EC2Service;
  private readonly iamService: IAMService;
  private readonly albService: ALBService;
  private resources: InfrastructureResources | null = null;
  private readonly stsClient: STSClient;
  private readonly globalConfig: GlobalConfigService;

  constructor(config: InfrastructureConfig) {
    this.config = config;
    this.uniqueId = nanoid(10);

    const clientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    };
    const ec2Client = new EC2Client(clientConfig);
    const iamClient = new IAMClient(clientConfig);
    const albClient = new ElasticLoadBalancingV2Client(clientConfig);
    this.stsClient = new STSClient(clientConfig);

    this.vpcService = new VpcService(config, ec2Client);
    const cidrService = new CIDRService(ec2Client);
    this.subnetService = new SubnetService(config, ec2Client, cidrService);
    this.securityGroupService = new SecurityGroupService(config, ec2Client);
    this.ec2Service = new EC2Service(config, ec2Client);
    this.iamService = new IAMService(config, iamClient);
    this.albService = new ALBService(config, albClient);
    this.globalConfig = new GlobalConfigService();
  }

  private async getAwsAccountDetails(): Promise<{
    accountId: string;
    arn: string;
  }> {
    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.stsClient.send(command);
      return {
        accountId: response.Account || "Unknown",
        arn: response.Arn || "Unknown",
      };
    } catch (error) {
      throw new InfrastructureError(
        `Failed to get AWS account details: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "AWS_ACCOUNT_ERROR"
      );
    }
  }

  async createInfrastructure(): Promise<{
    success: boolean;
    error?: string;
    resources?: InfrastructureResources;
  }> {
    try {
      // Get AWS account details
      const awsDetails = await this.getAwsAccountDetails();

      // Show configuration and AWS account details for confirmation
      console.log("\n=== Infrastructure Creation Configuration ===");
      console.log("AWS Account Details:");
      console.log(`Account ID: ${awsDetails.accountId}`);
      console.log(`ARN: ${awsDetails.arn}`);
      console.log("\nInfrastructure Configuration:");
      console.log({
        appName: this.config.appName,
        region: this.config.region,
        instanceType: this.config.instanceType,
        type: this.config.type,
        isNodeProject: this.config.isNodeProject,
      });

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Do you want to proceed with infrastructure creation?",
          default: false,
        },
      ]);

      if (!confirm) {
        console.log("Infrastructure creation cancelled by user.");
        return { success: false, error: "Operation cancelled by user" };
      }

      console.log("\n=== Creating Infrastructure ===");
      console.log("Configuration:", {
        appName: this.config.appName,
        region: this.config.region,
        instanceType: this.config.instanceType,
        type: this.config.type,
        isNodeProject: this.config.isNodeProject,
      });

      const resources: InfrastructureResources = {
        vpcId: null,
        subnetIds: [],
        securityGroupIds: [],
        instanceId: null,
        loadBalancerArn: null,
        targetGroupArn: null,
        certificateArn: null,
        routeTableId: null,
        internetGatewayId: null,
        instanceProfileName: null,
      };

      try {
        // Create VPC
        console.log("\n=== Creating VPC ===");
        const vpcDetails = await this.vpcService.selectOrCreateVpc();
        resources.vpcId = vpcDetails.vpcId;
        resources.routeTableId = vpcDetails.routeTableId;
        resources.internetGatewayId = vpcDetails.internetGatewayId;
        console.log("✓ VPC created");

        // Create subnets
        console.log("\n=== Creating Subnets ===");
        const subnetIds = await this.subnetService.createSubnets(
          vpcDetails.vpcId,
          vpcDetails.cidrBlock,
          vpcDetails.availabilityZones
        );
        resources.subnetIds = subnetIds;
        console.log("✓ Subnets created");

        // Create security groups
        console.log("\n=== Creating Security Groups ===");
        const securityGroupIds =
          await this.securityGroupService.createSecurityGroups(
            vpcDetails.vpcId
          );
        resources.securityGroupIds = securityGroupIds;
        console.log("✓ Security groups created");

        // Create IAM role and instance profile
        console.log("\n=== Creating IAM Role and Instance Profile ===");
        const instanceProfileName =
          await this.iamService.createInstanceProfile();
        resources.instanceProfileName = instanceProfileName;
        console.log("✓ IAM role and instance profile created");

        // Create EC2 instance
        console.log("\n=== Creating EC2 Instance ===");
        const instanceId = await this.ec2Service.createEC2Instance(
          subnetIds[1],
          securityGroupIds[1],
          instanceProfileName
        );
        resources.instanceId = instanceId;
        console.log("✓ EC2 instance created");

        // Wait for instance to be running
        console.log("\n=== Waiting for Instance to be Running ===");
        await this.ec2Service.waitForInstanceToBeRunning(instanceId);
        console.log("✓ Instance is running");

        // Create ALB and target group
        console.log("\n=== Creating Application Load Balancer ===");
        const albResources = await this.albService.createLoadBalancer(
          vpcDetails.vpcId,
          subnetIds,
          securityGroupIds[0]
        );
        resources.loadBalancerArn = albResources.loadBalancerArn;
        resources.targetGroupArn = albResources.targetGroupArn;
        console.log("✓ ALB and target group created");

        // Register instance with target group
        await this.albService.registerTarget(
          albResources.targetGroupArn,
          instanceId
        );
        console.log("✓ Instance registered with Target Group");

        // Wait for target health check only for Node.js projects
        if (this.config.isNodeProject) {
          console.log("\n=== Waiting for Target Health Check ===");
          const isHealthy = await this.albService.waitForHealthCheck(
            albResources.targetGroupArn,
            instanceId
          );
          if (!isHealthy) {
            throw new InfrastructureError(
              "Target failed health check",
              "ALB_ERROR"
            );
          }
          console.log("✓ Target health check passed");
        } else {
          console.log("\n=== Skipping Health Check ===");
          console.log(
            "No web server codebase was deployed, skipping health check"
          );
        }

        // Save resources to config
        // TODO: save to a config dir/file for vcs
        // await this.globalConfig.addApp(
        //   this.config.appName,
        //   this.uniqueId,
        //   resources
        // );

        console.log("\n=== Infrastructure Creation Complete ===");
        console.log(
          "Load Balancer URL:",
          `http://${albResources.loadBalancerArn}`
        );
        console.log("Instance ID:", instanceId);
        console.log("Target Group ARN:", albResources.targetGroupArn);
        console.log("Security Group IDs:", securityGroupIds);
        console.log("Subnet IDs:", subnetIds);
        console.log("VPC ID:", vpcDetails.vpcId);
        console.log("Instance Profile Name:", instanceProfileName);

        return { success: true, resources };
      } catch (error) {
        console.error(
          "\n❌ Error during infrastructure creation:",
          error instanceof Error ? error.message : "Unknown error"
        );
        console.log("\n=== Starting Rollback Process ===");
        console.log("Resources to rollback:", resources);
        await this.rollbackDeletion(resources, new Set());
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } catch (error) {
      console.error("Error in createInfrastructure:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  private async retryOperation(
    operation: () => Promise<void>,
    resourceName: string,
    maxRetries: number,
    failedResources: { resource: string; error: string }[]
  ): Promise<void> {
    try {
      // Try the operation once
      await operation();
    } catch (error) {
      // If operation fails, add to failed resources and don't retry
      failedResources.push({
        resource: resourceName,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`❌ Failed to delete ${resourceName}: ${error}`);
    }
  }

  private async rollbackDeletion(
    resources: InfrastructureResources,
    deletedResources: Set<string>
  ): Promise<void> {
    try {
      if (resources.instanceId && !deletedResources.has("instance")) {
        console.log("Rolling back EC2 instance...");
        await this.ec2Service.terminateInstance(resources.instanceId);
        deletedResources.add("instance");
        console.log("✓ EC2 instance terminated");
      }

      if (resources.targetGroupArn && !deletedResources.has("targetGroup")) {
        console.log("Rolling back target group...");
        await this.albService.deleteLoadBalancer(
          resources.loadBalancerArn!,
          resources.targetGroupArn
        );
        deletedResources.add("targetGroup");
        console.log("✓ Target group deleted");
      }

      if (resources.loadBalancerArn && !deletedResources.has("loadBalancer")) {
        console.log("Rolling back load balancer...");
        await this.albService.deleteLoadBalancer(
          resources.loadBalancerArn,
          resources.targetGroupArn!
        );
        deletedResources.add("loadBalancer");
        console.log("✓ Load balancer deleted");
      }

      if (
        resources.securityGroupIds?.length &&
        !deletedResources.has("securityGroups")
      ) {
        console.log("Rolling back security groups...");
        await this.securityGroupService.deleteSecurityGroups(
          resources.securityGroupIds
        );
        deletedResources.add("securityGroups");
        console.log("✓ Security groups deleted");
      }

      if (resources.subnetIds?.length && !deletedResources.has("subnets")) {
        console.log("Rolling back subnets...");
        await this.subnetService.deleteSubnets(resources.subnetIds);
        deletedResources.add("subnets");
        console.log("✓ Subnets deleted");
      }

      if (
        resources.vpcId &&
        resources.routeTableId &&
        resources.internetGatewayId &&
        !deletedResources.has("vpc")
      ) {
        console.log("Rolling back VPC...");
        await this.vpcService.deleteVpc(
          resources.vpcId,
          resources.routeTableId,
          resources.internetGatewayId
        );
        deletedResources.add("vpc");
        console.log("✓ VPC deleted");
      }

      if (
        resources.instanceProfileName &&
        !deletedResources.has("instanceProfile")
      ) {
        console.log("Rolling back IAM instance profile...");
        await this.iamService.deleteInstanceProfile(
          resources.instanceProfileName
        );
        deletedResources.add("instanceProfile");
        console.log("✓ IAM instance profile deleted");
      }

      console.log("\n✓ Rollback completed successfully");
    } catch (error) {
      console.error(
        "\n❌ Error during rollback:",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw new InfrastructureError(
        "Failed to complete rollback process",
        "ROLLBACK_ERROR"
      );
    }
  }

  async deleteInfrastructure(): Promise<DeleteInfrastructureResponse> {
    const MAX_RETRIES = 3;
    const deletedResources: Set<string> = new Set();
    const failedResources: { resource: string; error: string }[] = [];

    try {
      const app = await this.globalConfig.getApp(this.config.appName);
      if (!app) {
        return {
          success: false,
          error: `App ${this.config.appName} not found`,
        };
      }

      const resources = app.resources;

      // Delete resources in reverse order of creation with rollback handling
      try {
        // Step 1: Deregister target from ALB
        if (resources.instanceId && resources.targetGroupArn) {
          await this.retryOperation(
            async () => {
              await this.albService.deregisterTarget(
                resources.targetGroupArn!,
                resources.instanceId!
              );
              deletedResources.add("target_registration");
            },
            "target deregistration",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 2: Delete ALB and target group
        if (resources.loadBalancerArn && resources.targetGroupArn) {
          await this.retryOperation(
            async () => {
              await this.albService.deleteLoadBalancer(
                resources.loadBalancerArn!,
                resources.targetGroupArn!
              );
              deletedResources.add("load_balancer");
            },
            "load balancer",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 3: Terminate EC2 instance
        if (resources.instanceId) {
          await this.retryOperation(
            async () => {
              await this.ec2Service.terminateInstance(resources.instanceId!);
              deletedResources.add("ec2_instance");
            },
            "EC2 instance",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 4: Delete security groups
        if (resources.securityGroupIds) {
          await this.retryOperation(
            async () => {
              await this.securityGroupService.deleteSecurityGroups(
                resources.securityGroupIds
              );
              deletedResources.add("security_groups");
            },
            "security groups",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 5: Delete subnets
        if (resources.subnetIds) {
          await this.retryOperation(
            async () => {
              await this.subnetService.deleteSubnets(resources.subnetIds);
              deletedResources.add("subnets");
            },
            "subnets",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 6: Delete VPC and related resources
        if (
          resources.vpcId &&
          resources.routeTableId &&
          resources.internetGatewayId
        ) {
          await this.retryOperation(
            async () => {
              await this.vpcService.deleteVpc(
                resources.vpcId!,
                resources.routeTableId!,
                resources.internetGatewayId!
              );
              deletedResources.add("vpc");
            },
            "VPC",
            MAX_RETRIES,
            failedResources
          );
        }

        // Step 7: Delete IAM instance profile
        if (resources.instanceProfileName) {
          await this.retryOperation(
            async () => {
              await this.iamService.deleteInstanceProfile(
                resources.instanceProfileName!
              );
              deletedResources.add("instance_profile");
            },
            "IAM instance profile",
            MAX_RETRIES,
            failedResources
          );
        }

        // Remove app from global config only if all resources were deleted or skipped
        await this.globalConfig.removeApp(this.config.appName);
        console.log("Infrastructure deleted successfully!");

        // Log any failed resources
        if (failedResources.length > 0) {
          console.warn("\nWarning: Some resources could not be deleted:");
          failedResources.forEach(({ resource, error }) => {
            console.warn(`- ${resource}: ${error}`);
          });
        }

        return {
          success: true,
          error:
            failedResources.length > 0
              ? "Some resources could not be deleted"
              : undefined,
        };
      } catch (error) {
        // Attempt rollback for the successfully deleted resources
        console.error("Error during deletion, attempting rollback...");
        await this.rollbackDeletion(resources, deletedResources);

        return {
          success: false,
          error: `Failed to delete infrastructure: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    } catch (error) {
      console.error("Error in deleteInfrastructure:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async getResources(): Promise<InfrastructureResources | null> {
    try {
      const app = await this.globalConfig.getApp(this.config.appName);
      if (app) {
        return app.resources;
      }
      return null;
    } catch (error) {
      console.error("Error getting resources:", error);
      return null;
    }
  }

  async purgeAllApps(): Promise<void> {
    try {
      const apps = await this.globalConfig.getAllApps();
      for (const app of apps) {
        const tempConfig = { ...this.config, appName: app.name };
        const tempService = new InfrastructureService(tempConfig);
        await tempService.deleteInfrastructure();
      }
      await this.globalConfig.purgeAllApps();
      console.log(
        "All apps and their resources have been purged successfully!"
      );
    } catch (error: unknown) {
      console.error("Error purging all apps:", error);
      throw new InfrastructureError(
        error instanceof Error ? error.message : "Unknown error occurred",
        "APP_PURGE_FAILED"
      );
    }
  }
}

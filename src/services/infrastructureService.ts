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
import { CIDRService } from "./CIDRService";
import { ConfigService } from "./configService";
import { generateConfigTemplate } from "../utls/generateConfigTemplate";

export class InfrastructureService {
  private config: InfrastructureConfig;
  private readonly uniqueId: string;
  private readonly vpcService: VpcService;
  private readonly subnetService: SubnetService;
  private readonly securityGroupService: SecurityGroupService;
  private readonly ec2Service: EC2Service;
  private readonly iamService: IAMService;
  private readonly albService: ALBService;
  private resources: InfrastructureResources | null = null;
  private readonly stsClient: STSClient;
  private readonly configService: ConfigService;

  constructor(config: InfrastructureConfig, configService: ConfigService) {
    this.config = config;
    this.uniqueId = nanoid(10);

    const awsClientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    };
    const ec2Client = new EC2Client(awsClientConfig);
    const iamClient = new IAMClient(awsClientConfig);
    const albClient = new ElasticLoadBalancingV2Client(awsClientConfig);
    this.stsClient = new STSClient(awsClientConfig);

    this.vpcService = new VpcService(config, ec2Client);
    const cidrService = new CIDRService(ec2Client);
    this.subnetService = new SubnetService(config, ec2Client, cidrService);
    this.securityGroupService = new SecurityGroupService(config, ec2Client);
    this.ec2Service = new EC2Service(config, ec2Client);
    this.iamService = new IAMService(config, iamClient);
    this.albService = new ALBService(config, albClient);
    this.configService = configService;
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

      await this.configService.updateConfigFile(this.config);

      console.log("\n=== Creating Infrastructure ===");
      console.log("Configuration:", {
        appName: this.config.appName,
        region: this.config.region,
        instanceType: this.config.instanceType,
        type: this.config.type,
        isNodeProject: this.config.isNodeProject,
      });

      // Create VPC
      console.log("\n=== Creating VPC ===");
      const vpcDetails = await this.vpcService.selectOrCreateVpc();

      // update config
      this.config.resources.vpcId = vpcDetails.vpcId;
      this.config.resources.routeTableId = vpcDetails.routeTableId;
      this.config.resources.internetGatewayId = vpcDetails.internetGatewayId;
      await this.configService.updateConfigFile(this.config);
      console.log("✓ VPC created");

      // Create subnets
      console.log("\n=== Creating Subnets ===");
      const subnetIds = await this.subnetService.createSubnets(
        vpcDetails.vpcId,
        vpcDetails.cidrBlock,
        vpcDetails.availabilityZones
      );
      this.config.resources.subnetIds = subnetIds;
      console.log("✓ Subnets created");
      await this.configService.updateConfigFile(this.config);

      // Create security groups
      console.log("\n=== Creating Security Groups ===");
      const securityGroupIds =
        await this.securityGroupService.createSecurityGroups(vpcDetails.vpcId);
      this.config.resources.securityGroupIds = securityGroupIds;
      console.log("✓ Security groups created");
      await this.configService.updateConfigFile(this.config);

      // Create IAM role and instance profile
      console.log("\n=== Creating IAM Role and Instance Profile ===");
      const instanceProfileName = await this.iamService.createInstanceProfile();
      this.config.resources.instanceProfileName = instanceProfileName;
      console.log("✓ IAM role and instance profile created");
      await this.configService.updateConfigFile(this.config);

      // Create EC2 instance
      console.log("\n=== Creating EC2 Instance ===");
      const instanceId = await this.ec2Service.createEC2Instance(
        subnetIds[1],
        securityGroupIds[1],
        instanceProfileName
      );
      this.config.resources.instanceId = instanceId;
      console.log("✓ EC2 instance created");
      await this.configService.updateConfigFile(this.config);

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
      this.config.resources.loadBalancerArn = albResources.loadBalancerArn;
      this.config.resources.targetGroupArn = albResources.targetGroupArn;
      console.log("✓ ALB and target group created");
      await this.configService.updateConfigFile(this.config);

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

      console.log("\n=== Infrastructure Creation Complete ===");
      console.log(
        "Load Balancer URL:",
        `http://${albResources.loadBalancerArn}`
      );

      // TODO: Pretty print the succesfull output on completion(maybe in a table or something more organized than console.logs)

      console.log("Instance ID:", instanceId);
      console.log("Target Group ARN:", albResources.targetGroupArn);
      console.log("Security Group IDs:", securityGroupIds);
      console.log("Subnet IDs:", subnetIds);
      console.log("VPC ID:", vpcDetails.vpcId);
      console.log("Instance Profile Name:", instanceProfileName);
      await this.configService.updateConfigFile(this.config);

      return { success: true, resources: this.config.resources };
    } catch (error) {
      console.error(
        "\n❌ Error during infrastructure creation:",
        error instanceof Error ? error.message : "Unknown error"
      );
      console.log("\n=== Starting Rollback Process ===");
      console.log("Resources to rollback:", this.config.resources);
      await this.rollbackDeletion(
        this.config.resources as InfrastructureConfig["resources"],
        new Set()
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
      const app = await this.config.appName;
      if (!app) {
        return {
          success: false,
          error: `App ${this.config.appName} not found`,
        };
      }

      const resources = this.config.resources;

      // Delete resources in reverse order of creation

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

      console.log("Updating config\n", {
        ...this.config,
        resources: {
          ...this.config.resources,
          targetGroupArn: null,
          loadBalancerArn: null,
        },
      });

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          targetGroupArn: null,
          loadBalancerArn: null,
        },
      });

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
        await this.ec2Service.waitForInstanceToBeTerminated(
          resources.instanceId
        );
      }

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          instanceId: null,
        },
      });

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

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          securityGroupIds: [],
        },
      });

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

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          subnetIds: [],
        },
      });

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

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          vpcId: null,
        },
      });

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

      this.updateLocalConfigAndFileOnDelete({
        ...this.config,
        resources: {
          ...this.config.resources,
          instanceProfileName: null,
        },
      });

      // Log any failed resources
      if (failedResources.length > 0) {
        console.warn("\nWarning: Some resources could not be deleted:");
        failedResources.forEach(({ resource, error }) => {
          console.warn(`- ${resource}: ${error}`);
        });
      }

      // await this.globalConfig.removeApp(this.config.appName);
      console.log("Infrastructure deleted successfully!");

      // Reset config to initial state
      this.updateLocalConfigAndFileOnDelete(generateConfigTemplate());

      return {
        success: true,
        error:
          failedResources.length > 0
            ? "Some resources could not be deleted"
            : undefined,
      };
    } catch (error) {
      console.error("Error in deleteInfrastructure:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  private async updateLocalConfigAndFileOnDelete(opts: InfrastructureConfig) {
    this.config = opts;
    this.configService.updateConfigFile(opts);
  }

  async fetchResourcesStatus() {
    const ec2 = await this.ec2Service.fetchInstance(
      this.config.resources.instanceId as string
    );
    const vpc = await this.vpcService.fetchVpc(
      this.config.resources.vpcId as string
    );
    const alb = await this.albService.fetchLoadbalancer(
      this.config.resources.loadBalancerArn as string
    );
    return { ec2, vpc, alb };
  }

  async getResources(): Promise<InfrastructureResources | null> {
    try {
      return this.config.resources ? this.config.resources : null;
    } catch (error) {
      console.error("Error getting resources:", error);
      return null;
    }
  }
}

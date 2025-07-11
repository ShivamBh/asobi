import {
  CreateSubnetCommand,
  DeleteSubnetCommand,
  DescribeSubnetsCommand,
  EC2,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { BaseService } from "./base";
import { InfrastructureConfig } from "../types";
import { InfrastructureError } from "../utls/errors";
import { CIDRService } from "./CIDRService";

export class SubnetService extends BaseService {
  private readonly ec2Client: EC2Client;

  constructor(
    config: InfrastructureConfig,
    ec2Client: EC2Client,
    cidrService: CIDRService
  ) {
    super(config);
    this.ec2Client = ec2Client;
  }

  async createSubnets(
    vpcId: string,
    vpcCidrBlock: string,
    availabilityZones: string[]
  ): Promise<string[]> {
    try {
      console.log("Creating subnet....");

      const subnetIds = [];
      const baseCidr = vpcCidrBlock.split("/")[0];

      const cidrParts = baseCidr.split(".");

      // Get existing subnets in VPC
      const existingSubnets = await this.getExistingSubnets(vpcId);
      const exisitingCidrs = new Set(
        existingSubnets.map((subnet) => subnet.CidrBlock)
      );

      // Find available CIDR blocks
      let subnetIndex = 1;
      for (let i = 0; i < Math.min(2, availabilityZones.length); i++) {
        let subnetCidr: string;

        do {
          subnetCidr = `${cidrParts[0]}.${cidrParts[1]}.${subnetIndex}.0/24`;
          subnetIndex++;
        } while (exisitingCidrs.has(subnetCidr));

        const command = new CreateSubnetCommand({
          VpcId: vpcId,
          CidrBlock: subnetCidr,
          AvailabilityZone: availabilityZones[i],
          TagSpecifications: [
            {
              ResourceType: "subnet",
              Tags: this.getCommonTags(this.getResourceName(`subnet-${i + 1}`)),
            },
          ],
        });

        const response = await this.ec2Client.send(command);
        subnetIds.push(response.Subnet?.SubnetId || "");
      }

      return subnetIds;
    } catch (e) {
      console.error(`Error creating subnet: `, e);
      throw new InfrastructureError("Failed to create subnet", "SUBNET_ERROR");
    }
  }

  async deleteSubnets(subnetIds: string[]): Promise<void> {
    try {
      for (const subnetId of subnetIds) {
        const command = new DeleteSubnetCommand({
          SubnetId: subnetId,
        });
        await this.ec2Client.send(command);
      }
    } catch (e) {
      console.error("Error deleting subnets", e);
      throw new InfrastructureError("Failed to delete subnets", "SUBNET_ERROR");
    }
  }

  async getSubnets(vpcId: string): Promise<string[]> {
    try {
      const command = new DescribeSubnetsCommand({
        Filters: [
          { Name: "vpc-id", Values: [vpcId] },
          { Name: "tag:AppName", Values: [this.config.appName] },
          { Name: "tag:UniqueId", Values: [this.uniqueId] },
        ],
      });
      const response = await this.ec2Client.send(command);
      return response.Subnets?.map((subnet) => subnet.SubnetId || "") || [];
    } catch (e) {
      console.error("Error fetching subnets", e);
      return [];
    }
  }

  private async getExistingSubnets(
    vpcId: string
  ): Promise<{ CidrBlock: string }[]> {
    try {
      const command = new DescribeSubnetsCommand({
        Filters: [
          {
            Name: "vpc-id",
            Values: [vpcId],
          },
        ],
      });
      const response = await this.ec2Client.send(command);

      return (
        response.Subnets?.map((subnet) => ({
          CidrBlock: subnet.CidrBlock || "",
        })) || []
      );
    } catch (e) {
      console.error("Error getting existing subnets:", e);
      return [];
    }
  }
}

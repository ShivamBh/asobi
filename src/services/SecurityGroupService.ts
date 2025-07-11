import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { BaseService } from "./base";
import { InfrastructureConfig } from "../types";
import { InfrastructureError } from "../utls/errors";

export class SecurityGroupService extends BaseService {
  private readonly ec2Client: EC2Client;
  constructor(config: InfrastructureConfig, ec2Client: EC2Client) {
    super(config);
    this.ec2Client = ec2Client;
  }

  async createSecurityGroups(vpcId: string): Promise<string[]> {
    try {
      const securityGroupIds = [];
      const securityGroups = [
        {
          name: "alb-sg",
          description: "Security group for ALB",
          ports:
            this.config.type === "load-balanced-web-service" ? [80, 443] : [80],
        },
        {
          name: "ec2-sg",
          description: "Security group for ec2 instance",
          port:
            this.config.type === "load-balanced-web-service"
              ? this.config.port
              : 80,
        },
      ];

      for (const sg of securityGroups) {
        const command = new CreateSecurityGroupCommand({
          GroupName: this.getResourceName(sg.name),
          Description: sg.description,
          VpcId: vpcId,
          TagSpecifications: [
            {
              ResourceType: "security-group",
              Tags: this.getCommonTags(this.getResourceName(sg.name)),
            },
          ],
        });
        const response = await this.ec2Client.send(command);
        securityGroupIds.push(response.GroupId || "");

        // Add inbound rules
        const authorizeCommand = new AuthorizeSecurityGroupIngressCommand({
          GroupId: response.GroupId,
          IpPermissions: sg.ports
            ? sg.ports.map((port) => ({
                IpProtocol: "tcp",
                FromPort: port,
                ToPort: port,
                IpRanges: [{ CidrIp: "0.0.0.0/0" }],
              }))
            : [
                {
                  IpProtocol: "tcp",
                  FromPort: sg.port,
                  ToPort: sg.port,
                  IpRanges: [{ CidrIp: "0.0.0.0/0" }],
                },
              ],
        });
        await this.ec2Client.send(authorizeCommand);
      }

      return securityGroupIds;
    } catch (e) {
      console.error("Error creating security group", e);
      throw new InfrastructureError(
        "Failed to create security groups",
        "SECURITY_GROUP_ERROR"
      );
    }
  }

  async deleteSecurityGroups(securityGroupIds: string[]): Promise<void> {
    try {
      for (const groupId of securityGroupIds) {
        const command = new DeleteSecurityGroupCommand({ GroupId: groupId });
        await this.ec2Client.send(command);
      }
    } catch (e) {
      console.error("Error deleting security groups", e);
      new InfrastructureError(
        "Failed to delete security groups",
        "SECURITY_GROUPS_ERROR"
      );
    }
  }

  async getSecurityGroups(vpcId: string): Promise<string[]> {
    try {
      const command = new DescribeSecurityGroupsCommand({
        Filters: [
          { Name: "vpc-id", Values: [vpcId] },
          { Name: "tag:AppName", Values: [this.config.appName] },
          { Name: "tag:UniqueId", Values: [this.uniqueId] },
        ],
      });

      const response = await this.ec2Client.send(command);
      // TODO: Handle empty or error response separately?
      return response.SecurityGroups?.map((sg) => sg.GroupId || "") || [];
    } catch (e) {
      console.error("Error fetching security groups", e);
      return [];
    }
  }
}

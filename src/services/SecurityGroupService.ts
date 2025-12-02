import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupIngressCommand,
  SecurityGroup,
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
      const securityGroupIds: string[] = [];

      // 1. Create ALB Security Group
      const albSgResponse = await this.ec2Client.send(
        new CreateSecurityGroupCommand({
          GroupName: this.getResourceName("alb-sg"),
          Description: "Security group for ALB",
          VpcId: vpcId,
          TagSpecifications: [
            {
              ResourceType: "security-group",
              Tags: this.getCommonTags(this.getResourceName("alb-sg")),
            },
          ],
        })
      );
      const albSgId = albSgResponse.GroupId!;
      securityGroupIds.push(albSgId);

      // 2. Add ALB inbound rules
      await this.ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: albSgId,
          IpPermissions: [
            {
              IpProtocol: "tcp",
              FromPort: 80,
              ToPort: 80,
              IpRanges: [
                {
                  CidrIp: "0.0.0.0/0",
                  Description: "HTTP from internet",
                },
              ],
            },
            ...(this.config.type === "load-balanced-web-service"
              ? [
                  {
                    IpProtocol: "tcp",
                    FromPort: 443,
                    ToPort: 443,
                    IpRanges: [
                      {
                        CidrIp: "0.0.0.0/0",
                        Description: "HTTPS from internet",
                      },
                    ],
                  },
                ]
              : []),
          ],
        })
      );

      // 3. Create EC2 Security Group
      const ec2SgResponse = await this.ec2Client.send(
        new CreateSecurityGroupCommand({
          GroupName: this.getResourceName("ec2-sg"),
          Description: "Security group for EC2 instance",
          VpcId: vpcId,
          TagSpecifications: [
            {
              ResourceType: "security-group",
              Tags: this.getCommonTags(this.getResourceName("ec2-sg")),
            },
          ],
        })
      );
      const ec2SgId = ec2SgResponse.GroupId!;
      securityGroupIds.push(ec2SgId);

      // 4. Add EC2 inbound rules with ALB as source
      await this.ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: ec2SgId,
          IpPermissions: [
            {
              IpProtocol: "tcp",
              FromPort: this.config.port || 80,
              ToPort: this.config.port || 80,
              UserIdGroupPairs: [
                {
                  GroupId: albSgId,
                  Description: "Allow traffic from ALB",
                },
              ],
            },
            {
              IpProtocol: "tcp",
              FromPort: 22,
              ToPort: 22,
              IpRanges: [
                {
                  CidrIp: "0.0.0.0/0",
                  Description: "SSH access",
                },
              ],
            },
          ],
        })
      );

      return securityGroupIds;
    } catch (e) {
      // TODO: catch specific errors with logging for easier debugging

      console.error("Error creating security groups:", e);
      throw new InfrastructureError(
        "Failed to create security groups",
        "SECURITY_GROUP_ERROR"
      );
    }
  }

  async deleteSecurityGroups(
    securityGroupIds: string[],
    ruleWaitTime: number = 1000,
    retryWaitTime: number = 5000
  ): Promise<void> {
    try {
      // Delete in reverse order (EC2 SG first, then ALB SG)
      for (const groupId of [...securityGroupIds].reverse()) {
        await this.deleteSingleSecurityGroup(
          groupId,
          ruleWaitTime,
          retryWaitTime
        );
      }
    } catch (e) {
      console.error("Error deleting security groups", e);
      throw new InfrastructureError(
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

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async describeSecurityGroup(
    groupId: string
  ): Promise<SecurityGroup | null> {
    const response = await this.ec2Client.send(
      new DescribeSecurityGroupsCommand({
        GroupIds: [groupId],
      })
    );
    return response.SecurityGroups?.[0] ?? null;
  }

  private async revokeAllIngressRules(groupId: string, sg: SecurityGroup) {
    if (!sg.IpPermissions || sg.IpPermissions.length === 0) {
      return;
    }

    await this.ec2Client.send(
      new RevokeSecurityGroupIngressCommand({
        GroupId: groupId,
        IpPermissions: sg.IpPermissions,
      })
    );
  }

  private async deleteSingleSecurityGroup(
    groupId: string,
    ruleWaitTime: number,
    retryWaitTime: number
  ): Promise<void> {
    // 1. Describe SG and revoke ingress if present
    const sg = await this.describeSecurityGroup(groupId);
    if (sg) {
      await this.revokeAllIngressRules(groupId, sg);
      // Give AWS a moment to apply rule changes
      await this.sleep(ruleWaitTime);
    }

    // 2. Try delete once, retry on DependencyViolation
    try {
      await this.ec2Client.send(
        new DeleteSecurityGroupCommand({
          GroupId: groupId,
        })
      );
      console.log(`Successfully deleted security group: ${groupId}`);
    } catch (err: any) {
      if (err?.name !== "DependencyViolation") {
        throw err;
      }

      console.log(
        `Dependency violation when deleting security group ${groupId}. ` +
          `Retrying in ${retryWaitTime}ms...`
      );
      await this.sleep(retryWaitTime);

      // One retry; if this fails, let it bubble out to the caller
      await this.ec2Client.send(
        new DeleteSecurityGroupCommand({
          GroupId: groupId,
        })
      );

      console.log(
        `Successfully deleted security group after retry: ${groupId}`
      );
    }
  }
}

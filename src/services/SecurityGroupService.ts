import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupIngressCommand,
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
      console.error("Error creating security groups:", e);
      throw new InfrastructureError(
        "Failed to create security groups",
        "SECURITY_GROUP_ERROR"
      );
    }
  }

  // async createSecurityGroups(vpcId: string): Promise<string[]> {
  //   try {
  //     const securityGroupIds = [];
  //     const securityGroups = [
  //       {
  //         name: "alb-sg",
  //         description: "Security group for ALB",
  //         ports:
  //           this.config.type === "load-balanced-web-service" ? [80, 443] : [80],
  //       },
  //       {
  //         name: "ec2-sg",
  //         description: "Security group for ec2 instance",
  //         port:
  //           this.config.type === "load-balanced-web-service"
  //             ? this.config.port
  //             : 80,
  //       },
  //     ];

  //     for (const sg of securityGroups) {
  //       const command = new CreateSecurityGroupCommand({
  //         GroupName: this.getResourceName(sg.name),
  //         Description: sg.description,
  //         VpcId: vpcId,
  //         TagSpecifications: [
  //           {
  //             ResourceType: "security-group",
  //             Tags: this.getCommonTags(this.getResourceName(sg.name)),
  //           },
  //         ],
  //       });
  //       console.log("command", command);
  //       const response = await this.ec2Client.send(command);
  //       securityGroupIds.push(response.GroupId || "");

  //       // Add inbound rules
  //       const authorizeCommand = new AuthorizeSecurityGroupIngressCommand({
  //         GroupId: response.GroupId,
  //         IpPermissions: sg.ports
  //           ? sg.ports.map((port) => ({
  //               IpProtocol: "tcp",
  //               FromPort: port,
  //               ToPort: port,
  //               IpRanges: [{ CidrIp: "0.0.0.0/0" }],
  //             }))
  //           : sg.port
  //           ? [
  //               {
  //                 IpProtocol: "tcp",
  //                 FromPort: sg.port,
  //                 ToPort: sg.port,
  //                 IpRanges: [{ CidrIp: "0.0.0.0/0" }],
  //               },
  //             ]
  //           : [],
  //       });
  //       await this.ec2Client.send(authorizeCommand);
  //     }

  //     return securityGroupIds;
  //   } catch (e) {
  //     console.error("Error creating security group", e);
  //     throw new InfrastructureError(
  //       "Failed to create security groups",
  //       "SECURITY_GROUP_ERROR"
  //     );
  //   }
  // }

  // async deleteSecurityGroups(securityGroupIds: string[]): Promise<void> {
  //   try {
  //     for (const groupId of securityGroupIds) {
  //       const command = new DeleteSecurityGroupCommand({ GroupId: groupId });
  //       await this.ec2Client.send(command);
  //     }
  //   } catch (e) {
  //     console.error("Error deleting security groups", e);
  //     new InfrastructureError(
  //       "Failed to delete security groups",
  //       "SECURITY_GROUPS_ERROR"
  //     );
  //   }
  // }
  async deleteSecurityGroups(securityGroupIds: string[]): Promise<void> {
    try {
      // Delete in reverse order (EC2 SG first, then ALB SG)
      for (const groupId of [...securityGroupIds].reverse()) {
        try {
          // First, remove any ingress rules
          const describeCommand = new DescribeSecurityGroupsCommand({
            GroupIds: [groupId],
          });

          const response = await this.ec2Client.send(describeCommand);
          const sg = response.SecurityGroups?.[0];

          if (sg?.IpPermissions?.length) {
            await this.ec2Client.send(
              new RevokeSecurityGroupIngressCommand({
                GroupId: groupId,
                IpPermissions: sg.IpPermissions,
              })
            );
          }

          // Wait a bit for AWS to process the rule removal
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Then delete the security group
          const deleteCommand = new DeleteSecurityGroupCommand({
            GroupId: groupId,
          });
          await this.ec2Client.send(deleteCommand);

          console.log(`Successfully deleted security group: ${groupId}`);
        } catch (err: any) {
          if (err.name === "DependencyViolation") {
            console.log(
              `Retrying deletion of security group ${groupId} in 5 seconds...`
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
            await this.ec2Client.send(
              new DeleteSecurityGroupCommand({
                GroupId: groupId,
              })
            );
          } else {
            throw err;
          }
        }
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
}

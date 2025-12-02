import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityGroupService } from "../../../src/services/SecurityGroupService";
import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import { ec2Mock } from "../../setup";
import { mockConfig } from "../../fixtures/config";
import { getSecurityGroups } from "../../fixtures/sg";

const mockVpcId = "vpc-12345";

describe("SecurityGroupService", () => {
  let sgService: SecurityGroupService;
  let ec2Client: EC2Client;

  beforeEach(() => {
    ec2Mock.reset();
    vi.resetAllMocks();

    ec2Client = new EC2Client({ region: mockConfig.region });
    sgService = new SecurityGroupService(mockConfig, ec2Client);
  });

  describe("getSecurityGroups", () => {
    it("should return a list of security groups associated with the vpc", async () => {
      ec2Mock.on(DescribeSecurityGroupsCommand).resolves({
        SecurityGroups: getSecurityGroups(),
      });

      const result = await sgService.getSecurityGroups(mockVpcId);
      const mockCall = ec2Mock.commandCalls(DescribeSecurityGroupsCommand);

      expect(result).toEqual(getSecurityGroups().map((sg) => sg.GroupId));
      expect(mockCall).toHaveLength(1);
      expect(mockCall[0].args[0].input.Filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: "vpc-id", Values: [mockVpcId] }),
          expect.objectContaining({
            Name: "tag:AppName",
            Values: [mockConfig.appName],
          }),
          expect.objectContaining({ Name: "tag:UniqueId" }),
        ])
      );
    });

    it("should return empty error if no security groups are returned", async () => {
      ec2Mock.on(DescribeSecurityGroupsCommand).resolves({});

      const result = await sgService.getSecurityGroups(mockVpcId);
      expect(result).toEqual([]);
    });

    it("should return empty array if an error occurs while fetching security groups", async () => {
      ec2Mock
        .on(DescribeSecurityGroupsCommand)
        .rejects(new Error("failed to get security groups"));

      const result = await sgService.getSecurityGroups(mockVpcId);
      expect(result).toEqual([]);
    });
  });

  describe("createSecurityGroups", () => {
    const albSg = "albsg-12345";
    const ec2Sg = "ec2sg-12345";

    it("should create necessary security groups in the designated VPC", async () => {
      ec2Mock
        .on(CreateSecurityGroupCommand)
        .resolvesOnce({
          GroupId: albSg,
        })
        .resolves({
          GroupId: ec2Sg,
        });

      ec2Mock
        .on(AuthorizeSecurityGroupIngressCommand)
        .resolvesOnce({})
        .resolves({});

      const result = await sgService.createSecurityGroups(mockVpcId);
      const firstCreateSgCall = ec2Mock.commandCalls(
        CreateSecurityGroupCommand
      )[0];
      const secondCreateSgCall = ec2Mock.commandCalls(
        CreateSecurityGroupCommand
      )[1];
      const albInboundCall = ec2Mock.commandCalls(
        AuthorizeSecurityGroupIngressCommand
      )[0];
      const ec2InboundCall = ec2Mock.commandCalls(
        AuthorizeSecurityGroupIngressCommand
      )[1];

      expect(result).toEqual([albSg, ec2Sg]);
      expect(ec2Mock.commandCalls(CreateSecurityGroupCommand)).toHaveLength(2);
      expect(
        ec2Mock.commandCalls(AuthorizeSecurityGroupIngressCommand)
      ).toHaveLength(2);

      expect(
        ec2Mock
          .commandCalls(CreateSecurityGroupCommand)
          .map((i) => i.args[0].input.VpcId)
      ).toEqual([mockVpcId, mockVpcId]);

      expect(firstCreateSgCall.args[0].input.TagSpecifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ResourceType: "security-group",
            Tags: expect.arrayContaining([
              expect.objectContaining({ Key: "UniqueId" }),
              expect.objectContaining({ Key: "CreatedBy" }),
              expect.objectContaining({ Key: "Name" }),
            ]),
          }),
        ])
      );

      expect(secondCreateSgCall.args[0].input.TagSpecifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ResourceType: "security-group",
            Tags: expect.arrayContaining([
              expect.objectContaining({ Key: "UniqueId" }),
              expect.objectContaining({ Key: "CreatedBy" }),
              expect.objectContaining({ Key: "Name" }),
            ]),
          }),
        ])
      );

      expect(albInboundCall.args[0].input.GroupId).toEqual(albSg);
      expect(ec2InboundCall.args[0].input.GroupId).toEqual(ec2Sg);
    });

    it("should throw SECURITY_GROUP_ERROR when any of the commands fail", async () => {
      ec2Mock
        .on(CreateSecurityGroupCommand)
        .rejects(new Error("failed to create security group"));

      await expect(
        sgService.createSecurityGroups(mockVpcId)
      ).rejects.toMatchObject({
        code: "SECURITY_GROUP_ERROR",
        name: "InfrastructureError",
      });
    });
  });

  describe("deleteSecurityGroups", () => {
    const mockSecurityGroups = ["albsg-12345", "ec2sg-12345"];
    it("should delete all security groups and their dependencies", async () => {
      ec2Mock
        .on(DescribeSecurityGroupsCommand)
        .resolvesOnce({
          SecurityGroups: getSecurityGroups(),
        })
        .resolves({
          SecurityGroups: getSecurityGroups(),
        });

      ec2Mock.on(RevokeSecurityGroupIngressCommand).resolves({});

      ec2Mock.on(DeleteSecurityGroupCommand).resolves({});

      const ruleWaitTimeMs = 10;
      const retryWaitTimeMs = 10;
      await sgService.deleteSecurityGroups(
        mockSecurityGroups,
        ruleWaitTimeMs,
        retryWaitTimeMs
      );

      const describeCalls = ec2Mock.commandCalls(DescribeSecurityGroupsCommand);
      expect(ec2Mock.commandCalls(DeleteSecurityGroupCommand)).toHaveLength(2);
      expect(describeCalls).toHaveLength(2);
      expect(
        ec2Mock.commandCalls(RevokeSecurityGroupIngressCommand)
      ).toHaveLength(getSecurityGroups()[0].IpPermissions?.length as number);
    });

    it("should throw SECURITY_GROUPS_ERROR if it fails to delete secrurity groups or dependencies", async () => {
      ec2Mock
        .on(DeleteSecurityGroupCommand)
        .rejects(new Error("failed to delete security groups"));

      await expect(
        sgService.deleteSecurityGroups(mockSecurityGroups)
      ).rejects.toMatchObject({
        code: "SECURITY_GROUPS_ERROR",
        name: "InfrastructureError",
      });
    });
  });
});

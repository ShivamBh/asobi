import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubnetService } from "../../../src/services/SubnetService";
import {
  CreateSubnetCommand,
  DeleteSubnetCommand,
  DescribeSubnetsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { mockConfig } from "../../fixtures/config";
import { ec2Mock } from "../../setup";
import { getSubnets } from "../../fixtures/subnet";

const mockVpcId = "vpc-12345";
const mockCidr = "10.1.0.3/24";
const mockSubnets = getSubnets();
const mockAZ = ["az-1", "az-2"];

describe("subnetService", () => {
  let subnetService: SubnetService;
  let ec2Client: EC2Client;

  beforeEach(() => {
    vi.resetAllMocks();
    ec2Mock.reset();

    ec2Client = new EC2Client({ region: mockConfig.region });
    subnetService = new SubnetService(mockConfig, ec2Client);
  });

  describe("getSubnets", () => {
    it("should get all Subnets in the vpc", async () => {
      ec2Mock.on(DescribeSubnetsCommand).resolves({
        Subnets: [...getSubnets(mockVpcId)],
      });

      const result = await subnetService.getSubnets(mockVpcId);
      expect(result).toEqual(mockSubnets.map((s) => s.SubnetId));

      const descCall = ec2Mock.commandCalls(DescribeSubnetsCommand);
      expect(descCall).toHaveLength(1);

      expect(descCall[0].args[0].input.Filters).toEqual(
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

    it("should return empty array if no subnets are found", async () => {
      ec2Mock.on(DescribeSubnetsCommand).resolves({});

      const result = await subnetService.getSubnets(mockVpcId);
      expect(result).toEqual([]);
    });

    // TODO: should ideally throw an error and be caught upstream for operations requiring a subnet, check and re-implement this later
    it("should return empty array if an error occurs while fetching subnets", async () => {
      ec2Mock
        .on(DescribeSubnetsCommand)
        .rejects(new Error(`Failed to fetch subnets`));

      const result = await subnetService.getSubnets(mockVpcId);
      expect(result).toEqual([]);
    });
  });

  describe("createSubnets", () => {
    it("should create subnets in the given vpc in the AZs", async () => {
      let newSubnets: string[] = [];

      ec2Mock
        .on(DescribeSubnetsCommand)
        .resolves({ Subnets: [...mockSubnets] });

      let callCount = 0;
      ec2Mock.on(CreateSubnetCommand).callsFake((_input) => {
        callCount++;
        const id = `subnet-${callCount}`;
        newSubnets.push(id);
        return {
          Subnet: {
            SubnetId: `subnet-${callCount}`,
          },
        };
      });
      const result = await subnetService.createSubnets(
        mockVpcId,
        mockCidr,
        mockAZ
      );

      const createCall = ec2Mock.commandCalls(CreateSubnetCommand);

      expect(result).toEqual(newSubnets);
      expect(createCall).toHaveLength(newSubnets.length);
      expect(createCall[0].args[0].input.TagSpecifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ResourceType: "subnet",
            Tags: expect.arrayContaining([
              expect.objectContaining({
                Key: "Name",
                Value: expect.stringContaining("subn"),
              }),
            ]),
          }),
        ])
      );
    });

    it("should throw SUBNET_ERROR when the subnet creation fails", async () => {
      ec2Mock
        .on(DescribeSubnetsCommand)
        .resolves({ Subnets: [...mockSubnets] });

      ec2Mock
        .on(CreateSubnetCommand)
        .rejects(new Error(`failed to create subnet`));

      await expect(
        subnetService.createSubnets(mockVpcId, mockCidr, mockAZ)
      ).rejects.toMatchObject({
        code: "SUBNET_ERROR",
      });
    });
  });

  describe("deleteSubnets", () => {
    it("should delete subnets by id", async () => {
      const ids: string[] = mockSubnets.map((s) => s.SubnetId as string);
      ec2Mock.on(DeleteSubnetCommand).resolves({});
      await subnetService.deleteSubnets(ids);
      expect(ec2Mock.commandCalls(DeleteSubnetCommand)).toHaveLength(
        ids.length
      );
    });

    it("should throw SUBNET_ERROR when deletion fails", async () => {
      ec2Mock.on(DeleteSubnetCommand).rejects(new Error("DependencyViolation"));

      await expect(
        subnetService.deleteSubnets(["subnet-1"])
      ).rejects.toMatchObject({
        code: "SUBNET_ERROR",
        name: "InfrastructureError",
      });
    });
  });
});

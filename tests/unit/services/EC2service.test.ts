import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import { EC2Service } from "../../../src/services/EC2Service";
import {
  CreateKeyPairCommand,
  DeleteKeyPairCommand,
  DescribeInstancesCommand,
  EC2,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { mockConfig } from "../../fixtures/config";
import { ec2Mock, iamMock } from "../../setup";
import { GetInstanceProfileCommand } from "@aws-sdk/client-iam";
import { InfrastructureError } from "../../../src/utls/errors";
import { getInstanceProfile } from "../../fixtures/iam";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe("EC2Service", () => {
  let ec2Service: EC2Service;
  let ec2Client: EC2Client;

  beforeEach(() => {
    ec2Client = new EC2Client({ region: mockConfig.region });
    ec2Service = new EC2Service(mockConfig, ec2Client);
    vi.resetAllMocks();
  });

  it("should instantiate without errors", () => {
    expect(ec2Service).toBeDefined();
    expect(ec2Service).toBeInstanceOf(EC2Service);
  });

  describe("getInstance", () => {
    it("should return instance ID when instance exists", async () => {
      const mockInstanceId = "i-1234567890abcdef0";

      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                InstanceId: mockInstanceId,
                State: { Name: "running" },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.getInstance();

      expect(result).toBe(mockInstanceId);
      expect(ec2Mock.commandCalls(DescribeInstancesCommand)).toHaveLength(1);
    });

    it("should return null when no instances exist", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [],
      });

      const result = await ec2Service.getInstance();
      expect(result).toBeNull();
    });

    it("should throw EC2_ERROR when instance fetch fails", async () => {
      ec2Mock
        .on(DescribeInstancesCommand)
        .rejects(new Error(`Failed to fetch instance`));

      const result = await ec2Service.getInstance();
      expect(result).toBe(null);
    });
  });

  describe("createKeyPair", () => {
    const mockKeyMaterial =
      "-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----";

    it("should create key pair and save to correct filesystem path", async () => {
      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyPairId: "key-12345",
        KeyMaterial: mockKeyMaterial,
        KeyName: "test-app-key",
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const keyName = await ec2Service.createKeyPair();

      expect(keyName).toContain("test-app");
      expect(ec2Mock.commandCalls(CreateKeyPairCommand)).toHaveLength(1);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(".ssh"),
        { recursive: true }
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".pem"),
        mockKeyMaterial
      );

      expect(fs.chmodSync).toHaveBeenCalledWith(
        expect.stringContaining(".pem"),
        0o600
      );
    });

    it("should throw error if KeyMaterial is missing in response", async () => {
      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyPairId: "key-12345",
        KeyName: "test-app-key",
        KeyMaterial: undefined,
      });

      await expect(ec2Service.createKeyPair()).rejects.toThrow();
    });

    it("should throw error if KeyPairId is missing in response", async () => {
      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyPairId: undefined,
        KeyName: "test-app-key",
        KeyMaterial: mockKeyMaterial,
      });
      await expect(ec2Service.createKeyPair()).rejects.toThrow();
    });
  });

  describe("createEC2Instance", () => {
    const subnetId = "subnet-12345";
    const securityGroupId = "sg-12345";
    const instanceProfileName = "test-profile";

    const mockInstanceId = "i-1234567890abcdef0";
    const mockKeyMaterial =
      "-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----";

    it("should create an EC2 instance with correct dependencies", async () => {
      // Arrange: mock IAM profile lookup
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(instanceProfileName),
        },
      });

      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyMaterial: mockKeyMaterial,
        KeyPairId: "key-pair-12345",
        KeyName: expect.stringContaining("test-app"),
      });

      ec2Mock.on(RunInstancesCommand).resolves({
        Instances: [
          {
            InstanceId: mockInstanceId,
            State: {
              Name: "pending",
              Code: 0,
            },
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act

      const instanceId = await ec2Service.createEC2Instance(
        subnetId,
        securityGroupId,
        instanceProfileName
      );

      expect(instanceId).toBe(mockInstanceId),
        expect(iamMock.commandCalls(GetInstanceProfileCommand)).toHaveLength(1);
      expect(ec2Mock.commandCalls(CreateKeyPairCommand)).toHaveLength(1);
      expect(ec2Mock.commandCalls(RunInstancesCommand)).toHaveLength(1);

      // verify ec2 command was called with correct inputs
      const runInstanceCall = ec2Mock.commandCalls(RunInstancesCommand)[0];
      expect(runInstanceCall.args[0].input).toMatchObject({
        ImageId: mockConfig.amiId,
        InstanceType: mockConfig.instanceType,
        SubnetId: subnetId,
        SecurityGroupIds: [securityGroupId],
        MinCount: 1,
        MaxCount: 1,
      });

      expect(runInstanceCall.args[0].input.UserData).toBeDefined();

      // Assert: Verify user data is present
      expect(runInstanceCall.args[0].input.UserData).toBeDefined();

      // Assert: Verify filesystem operations
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(".ssh"),
        { recursive: true }
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".pem"),
        mockKeyMaterial
      );
      expect(fs.chmodSync).toHaveBeenCalledWith(
        expect.stringContaining(".pem"),
        0o600
      );
    });

    it("should throw an IAM_ERROR when IAM instance profile fetching fails", async () => {
      iamMock
        .on(GetInstanceProfileCommand)
        .rejects(new Error("failed to fetch instance profile"));

      await expect(
        ec2Service.createEC2Instance(
          subnetId,
          securityGroupId,
          instanceProfileName
        )
      ).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "IAM_ERROR",
        message: expect.stringContaining("ARN"),
      });
    });

    it("should throw an EC2_ERROR if no instance id is returned", async () => {
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(),
        },
      });

      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyMaterial: mockKeyMaterial,
        KeyPairId: "key-12345",
      });

      ec2Mock.on(RunInstancesCommand).resolves({
        Instances: [],
      });

      // vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        ec2Service.createEC2Instance(
          subnetId,
          securityGroupId,
          instanceProfileName
        )
      ).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "EC2_ERROR",
      });
    });

    it("should delete the newly created key pair if the instance creation fails", async () => {
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(instanceProfileName),
        },
      });

      ec2Mock.on(CreateKeyPairCommand).resolves({
        KeyMaterial: mockKeyMaterial,
        KeyPairId: "key-12345",
      });

      ec2Mock
        .on(RunInstancesCommand)
        .rejects(new Error("Error creating instance"));

      ec2Mock.on(DeleteKeyPairCommand).resolves({});

      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        ec2Service.createEC2Instance(
          subnetId,
          securityGroupId,
          instanceProfileName
        )
      ).rejects.toThrow();

      expect(ec2Mock.commandCalls(DeleteKeyPairCommand)).toHaveLength(1);
    });
  });

  describe("terminateInstance", () => {
    const mockInstanceId = "i-1234567890abcdef0";

    it("should terminate an instance with the provided instanceId", async () => {
      ec2Mock.on(TerminateInstancesCommand).resolves({});

      await ec2Service.terminateInstance(mockInstanceId);
      expect(ec2Mock.commandCalls(TerminateInstancesCommand)).toHaveLength(1);
    });

    it("should throw EC2_ERROR when it fails to terminate instance", async () => {
      ec2Mock
        .on(TerminateInstancesCommand)
        .rejects(new Error("failed to terminate instance"));

      await expect(
        ec2Service.terminateInstance(mockInstanceId)
      ).rejects.toMatchObject({
        code: "EC2_ERROR",
        name: "InfrastructureError",
      });
    });
  });

  describe("deleteKeyPair", () => {
    it("should delete the keypair from AWS and filesystem", async () => {
      ec2Mock.on(DeleteKeyPairCommand).resolves({});
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await ec2Service.deleteKeyPair();

      expect(ec2Mock.commandCalls(DeleteKeyPairCommand)).toHaveLength(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining(".pem")
      );
    });

    it("should throw EC2_ERROR when keypair deletion fails", async () => {
      ec2Mock.on(DeleteKeyPairCommand).rejects();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(ec2Service.deleteKeyPair()).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "EC2_ERROR",
      });
    });

    it("should not delete .pem file from filesystem if it does not exist", async () => {
      ec2Mock.on(DeleteKeyPairCommand).resolves({});
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await ec2Service.deleteKeyPair();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe("waitForInstanceToBeRunning", () => {
    const mockInstanceId = "i-123";
    it("should return when instance reaches running state", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "running",
                  Code: 16,
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeRunning(
        mockInstanceId,
        1,
        100
      );
      expect(result).toBe(true);
    });

    it("should return false after max_attempts", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "pending",
                  Code: 0,
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeRunning(
        mockInstanceId,
        1,
        100
      );
      expect(result).toBe(false);
    });

    it("should check max_attempts number of times before returning false", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "pending",
                  Code: 0,
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeRunning(
        mockInstanceId,
        3,
        10
      );
      expect(ec2Mock.commandCalls(DescribeInstancesCommand)).toHaveLength(3);
      expect(result).toBe(false);
    });

    it("should continue checking instance state max_attempt number of times even if the state fetch fails", async () => {
      ec2Mock.on(DescribeInstancesCommand).rejects({});

      await ec2Service.waitForInstanceToBeRunning(mockInstanceId, 3, 10);

      expect(ec2Mock.commandCalls(DescribeInstancesCommand)).toHaveLength(3);
    });
  });

  describe("waitForInstanceToBeTerminated", () => {
    const mockInstanceId = "i-123";

    it("should return true when an instance is terminated successfully", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "terminated",
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeTerminated(
        mockInstanceId,
        1,
        10
      );
      expect(result).toBe(true);
    });

    it("should return false after max_attempts", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "stopping",
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeTerminated(
        mockInstanceId,
        1,
        10
      );
      expect(result).toBe(false);
    });

    it("should run max_attempts number of times if instance is not terminated", async () => {
      ec2Mock.on(DescribeInstancesCommand).resolves({
        Reservations: [
          {
            Instances: [
              {
                State: {
                  Name: "stopping",
                },
              },
            ],
          },
        ],
      });

      const result = await ec2Service.waitForInstanceToBeTerminated(
        mockInstanceId,
        3,
        10
      );
      expect(ec2Mock.commandCalls(DescribeInstancesCommand)).toHaveLength(3);
    });

    it("should run max_attempts number of times even if instance state fetching fails", async () => {
      ec2Mock.on(DescribeInstancesCommand).rejects({});

      const result = await ec2Service.waitForInstanceToBeTerminated(
        mockInstanceId,
        3,
        10
      );
      expect(ec2Mock.commandCalls(DescribeInstancesCommand)).toHaveLength(3);
    });
  });
});

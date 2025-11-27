import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import { EC2Service } from "../../../src/services/EC2Service";
import {
  CreateKeyPairCommand,
  DescribeInstancesCommand,
  EC2,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { mockConfig } from "../../fixtures/config";
import { ec2Mock } from "../../setup";

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
  });

  describe("createKeyPair", async () => {
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
  });
});

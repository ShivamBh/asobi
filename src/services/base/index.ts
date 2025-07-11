import { customAlphabet, nanoid } from "nanoid";
import { InfrastructureConfig } from "../../types";

export class BaseService {
  protected readonly config: InfrastructureConfig;
  protected readonly uniqueId: string;
  protected readonly alphanumericId: string;

  constructor(config: InfrastructureConfig) {
    this.config = {
      ...config,
      instanceType: config.instanceType || "t2.micro",
      amiId: config.amiId || "ami-0e670eb768a5fc3d4",
      keyName: config.keyName || "default-key-pair",
      region: config.region || "us-east-1",
      type: config.type || "empty",
    };

    this.uniqueId = nanoid(8);

    const genAlphanumId = customAlphabet(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      8
    );
    this.alphanumericId = `asobi${genAlphanumId()}`;
  }

  protected getResourceName(resourceType: string): string {
    const genLowercaseId = customAlphabet(
      "abcdefghijklmnopqrstuvwxyz0123456789",
      8
    );

    // For all resources, use a format: {prefix}{uniqueId}
    const prefix =
      resourceType === "ec2-profile"
        ? "ec2p"
        : resourceType === "ec2-role"
        ? "ec2r"
        : resourceType === "alb"
        ? "alb"
        : resourceType === "tg"
        ? "tg"
        : resourceType.slice(0, 4).toLowerCase();

    return `${genLowercaseId()}`;
  }

  protected getCommonTags(
    resourceName: string
  ): { Key: string; Value: string }[] {
    return [
      { Key: "Name", Value: resourceName },
      { Key: "AsobiAppName", Value: this.config.appName },
      { Key: "UniqueId", Value: this.uniqueId },
      { Key: "CreatedBy", Value: "asobi" },
    ];
  }
}

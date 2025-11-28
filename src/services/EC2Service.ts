import {
  _InstanceType,
  CreateKeyPairCommand,
  DeleteKeyPairCommand,
  DescribeIamInstanceProfileAssociationsCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { BaseService } from "./base";
import { InfrastructureConfig } from "../types";
import { InfrastructureError } from "../utls/errors";
import { GetInstanceProfileCommand, IAMClient } from "@aws-sdk/client-iam";
import { error } from "console";
import path, { resolve } from "path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";

export class EC2Service extends BaseService {
  private readonly ec2Client: EC2Client;
  private readonly keyPairName: string;

  constructor(config: InfrastructureConfig, ec2Client: EC2Client) {
    super(config);
    this.ec2Client = ec2Client;
    this.keyPairName = `${this.config.appName}-${this.uniqueId}`;
  }

  /* Create an EC2 Instance */
  async createEC2Instance(
    subnetId: string,
    securityGroupId: string,
    instanceProfileName: string
  ): Promise<string> {
    try {
      // if (!instanceProfileName) {
      //   throw new InfrastructureError(
      //     "Instance profile name is required",
      //     "EC2_INSTANCE_ERROR"
      //   );
      // }
      // verify instance profile is available before creating the instance
      // await this.verifyInstanceProfile(instanceProfileName);

      // get the profile arn
      const profileArn = await this.getInstanceProfileArn(instanceProfileName);

      // create key pair before launching instance
      const keyName = await this.createKeyPair();

      console.log("Creating EC2 instance with configuration: ", {
        imageId: this.config.amiId,
        instanceType: this.config.instanceType,
        subnetId,
        securityGroupId,
        instanceProfileArn: profileArn,
        keyName,
      });

      // setup a basic bash script to set up the instance
      const userBashScript = `
        #!/bin/bash

        #Update system
        apt update -y

        #Install utilities
        apt install -y curl git
      `;

      const command = new RunInstancesCommand({
        ImageId: this.config.amiId,
        InstanceType: this.config.instanceType as _InstanceType,
        KeyName: keyName,
        MinCount: 1,
        MaxCount: 1,
        SubnetId: subnetId,
        SecurityGroupIds: [securityGroupId],
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: this.getCommonTags(this.getResourceName("ec2")),
          },
        ],
        UserData: Buffer.from(userBashScript).toString("base64"),
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: 20,
              VolumeType: "gp3",
              DeleteOnTermination: true,
            },
          },
        ],
      });

      console.log("Sending EC2 instance creation request....");
      const response = await this.ec2Client.send(command);
      const instanceId = response.Instances?.[0]?.InstanceId;

      if (!instanceId) {
        throw new InfrastructureError(
          "Failed to get instance ID from response during instance creation",
          "EC2_ERROR"
        );
      }

      console.log(`EC2 instance: ${instanceId} created successfully`);
      return instanceId;
    } catch (e) {
      console.error("Detailed EC2 instance creation error: ", e);

      // Handle cleanup if ec2 creation fails

      await this.deleteKeyPair();

      if (e instanceof InfrastructureError) {
        throw new InfrastructureError(e.message, e.code);
      }

      throw new InfrastructureError(
        `Failed to create EC2 instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "EC2_ERROR"
      );
    }
  }

  async terminateInstance(instanceId: string): Promise<void> {
    try {
      const command = new TerminateInstancesCommand({
        InstanceIds: [instanceId],
      });
      await this.ec2Client.send(command);
    } catch (error) {
      throw new InfrastructureError(
        "Failed to terminate instance",
        "EC2_ERROR"
      );
    }
  }

  async createKeyPair(): Promise<string> {
    try {
      // const describeCommand = new DescribeKeyPairsCommand({
      //   KeyNames: [this.keyPairName],
      // });

      // const result = await this.ec2Client.send(describeCommand);

      // if (!result) {
      // Key pair does not exist. Create it.
      console.log(`Creating new key pair: ${this.keyPairName}`);
      const command = new CreateKeyPairCommand({
        KeyName: this.keyPairName,
      });
      const response = await this.ec2Client.send(command);

      if (!response.KeyPairId || !response.KeyMaterial) {
        throw new InfrastructureError(
          `Failed to create key pair `,
          "EC2_ERROR"
        );
      }

      // Save the keypair to a file
      const keyDir = path.join(process.cwd(), ".ssh");
      if (!existsSync(keyDir)) {
        mkdirSync(keyDir, { recursive: true });
      }

      const keypath = path.join(keyDir, `${this.keyPairName}.pem`);
      writeFileSync(keypath, response.KeyMaterial);
      chmodSync(keypath, 0o600);

      console.log(
        `Key pair ${this.keyPairName} created and saved to ${keypath}`
      );

      return this.keyPairName;
      // }

      // console.log(`Key pair ${this.keyPairName} already exists.`);
      // return this.keyPairName;
    } catch (error: any) {
      // if (error.name === "InvalidKeyPair.NotFound") {
      // }
      console.error(`Error creating keypair: `, error);
      throw error;
    }
  }

  async deleteKeyPair(): Promise<void> {
    try {
      const command = new DeleteKeyPairCommand({
        KeyName: this.keyPairName,
      });

      await this.ec2Client.send(command);
      console.log(`Keypair: ${this.keyPairName} deleted successfully.`);

      // delete the local key file
      const keypath = path.join(
        process.cwd(),
        ".ssh",
        `${this.keyPairName}.pem`
      );

      if (existsSync(keypath)) {
        unlinkSync(keypath);
        console.log(`Local key file at '${keypath}' deleted.`);
      }
    } catch (e) {
      console.error("Error deleting key pair:", e);
      throw new InfrastructureError(
        `Failed to delete key pair: ${this.keyPairName}`,
        "EC2_ERROR"
      );
    }
  }

  async getInstance(): Promise<string | null> {
    try {
      const command = new DescribeInstancesCommand({
        Filters: [
          { Name: "tag:AppName", Values: [this.config.appName] },
          { Name: "tag:uniqueId", Values: [this.uniqueId] },
        ],
      });

      const response = await this.ec2Client.send(command);
      return response.Reservations?.[0]?.Instances?.[0]?.InstanceId || null;
    } catch (e) {
      console.error("Error getting instance: ", e);
      return null;
    }
  }

  async fetchInstance(instanceId: string) {
    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });
    const response = await this.ec2Client.send(command);
    return response.Reservations?.[0].Instances?.[0];
  }

  async waitForInstanceToBeTerminated(
    instanceId: string,
    maxAttempts: number = 30,
    waitTime: number = 3000
  ): Promise<boolean> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const command = new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        });
        const response = await this.ec2Client.send(command);
        const instance = response.Reservations?.[0]?.Instances?.[0];
        if (instance?.State?.Name === "terminated") {
          return true;
        }

        console.log(
          `Waiting for instance to be terminated...(attempt: ${attempts}/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        attempts++;
      } catch (e) {
        console.error(
          `Error checking instance termination status...Trying again`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    return false;
  }

  async waitForInstanceToBeRunning(
    instanceId: string,
    maxAttempts: number = 30,
    waitTime: number = 3000
  ): Promise<boolean> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const describeCommand = new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        });

        const response = await this.ec2Client.send(describeCommand);
        const instance = response.Reservations?.[0]?.Instances?.[0];

        if (instance?.State?.Name === "running" && instance.State.Code === 16) {
          return true;
        }

        console.log(
          `Waiting for instance to be running....(attempt ${
            attempts + 1
          }/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        attempts++;
      } catch (e) {
        console.error(
          `Error checking instance status...(attempt ${
            attempts + 1
          }/${maxAttempts})`
        );
        console.error(e);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
    return false;
  }

  private async verifyInstanceProfile(
    instanceProfileName: string
  ): Promise<void> {
    console.log(
      `Verifying instance profle ${instanceProfileName} is available...`
    );

    let attempts = 0;
    let maxAttempts = 30;
    let baseDelayMs = 2000;
    const maxDelayMs = 10000;

    while (attempts < maxAttempts) {
      try {
        // try to describe the instance profile to verify its available
        const command = new DescribeIamInstanceProfileAssociationsCommand({});
        await this.ec2Client.send(command);

        console.log("Instance profile is available.");
        return;
      } catch (error: any) {
        if (error.name === "InvalidIamInstanceProfileName") {
          attempts++;
          const delay = Math.min(
            baseDelayMs * Math.pow(1.5, attempts),
            maxDelayMs
          );
          console.log(
            `Waiting for instance profile to be available (attempt: ${attempts}/${maxAttempts}), delay: ${delay}ms)... `
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw new InfrastructureError(
      `Instance profile ${instanceProfileName} failed to become available after ${maxAttempts} attempts`,
      "EC2_PROFILE_VERIFICATION_FAILED"
    );
  }

  private async getRegion(): Promise<string> {
    const region = this.config.region;
    if (!region) {
      throw new InfrastructureError(
        "Failed to get AWS region",
        "EC2_INSTANCE_ERROR"
      );
    }

    return region;
  }

  private async getInstanceProfileArn(
    instanceProfileName: string
  ): Promise<string> {
    try {
      const region = await this.getRegion();
      const iamClient = new IAMClient({
        region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
      const command = new GetInstanceProfileCommand({
        InstanceProfileName: instanceProfileName,
      });
      const response = await iamClient.send(command);

      console.log("instance profile", response.InstanceProfile);

      if (!response.InstanceProfile?.Arn) {
        throw new InfrastructureError(
          "Failed to get instance profile ARN",
          "IAM_ERROR"
        );
      }
      return response.InstanceProfile.Arn;
    } catch (error) {
      throw new InfrastructureError(
        `Failed to get instance profile ARN: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "IAM_ERROR"
      );
    }
  }
}

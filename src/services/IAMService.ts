import {
  AddRoleToInstanceProfileCommand,
  AttachRolePolicyCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  DeleteInstanceProfileCommand,
  DeleteRoleCommand,
  DetachRolePolicyCommand,
  GetInstanceProfileCommand,
  GetRoleCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListInstanceProfilesCommand,
  RemoveRoleFromInstanceProfileCommand,
} from "@aws-sdk/client-iam";
import { BaseService } from "./base";
import { InfrastructureConfig } from "../types";
import { InfrastructureError } from "../utls/errors";

export class IAMService extends BaseService {
  private readonly iamClient: IAMClient;

  constructor(config: InfrastructureConfig, iamClient: IAMClient) {
    super(config);
    this.iamClient = iamClient;
  }

  async createInstanceProfile(
    maxAttempts: number = 10,
    baseDelayMs: number = 2000,
    maxDelayMs: number = 30000
  ): Promise<string> {
    try {
      // verify iam permission first
      await this.verifyIamPermissions();

      // get the region we are working on
      const region = await this.iamClient.config.region();
      console.log(`Creating instance profile in region: ${region}`);

      console.log(`Creating IAM role for EC2 instance...`);
      const roleName = this.getResourceName("ec2-role");
      console.log(`Generate role name: ${roleName}`);

      // Create the role
      const createRoleCommand = new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "ec2.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        Tags: this.getCommonTags(roleName),
      });

      await this.iamClient.send(createRoleCommand);

      console.log(`IAM role ${roleName} created successfully`);

      // Verify role was created
      const verifyRoleCommand = new GetRoleCommand({
        RoleName: roleName,
      });
      const role = await this.iamClient.send(verifyRoleCommand);
      if (!role.Role) {
        throw new InfrastructureError(
          `Role ${roleName} is not valid`,
          "IAM_ROLE_VERIFICATION_FAILED"
        );
      }

      console.log(`Verified role ${roleName} is valid`);

      // Attach necessary policies
      const policies = [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess",
        "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      ];

      for (const policyArn of policies) {
        const attachCommand = new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: policyArn,
        });

        await this.iamClient.send(attachCommand);
        console.log(`Attached policy ${policyArn} to role ${roleName}`);
      }

      console.log("Creating instance profile...");
      const profileName = this.getResourceName("ec2-profile");
      console.log("Generated profile name: ", { profileName });

      // Check if instance profile already exists
      // console.log("Checking instance profile creation");
      // const existingProfile = await this.iamClient.send(
      //   new GetInstanceProfileCommand({
      //     InstanceProfileName: profileName,
      //   })
      // );
      // if (existingProfile.InstanceProfile) {
      //   console.log(
      //     `Instance profile ${profileName} already exists. Reusing...`
      //   );
      //   return profileName;
      // }

      // console.log("profile does not exist. Create new. ");

      // Profile does not exists, create new
      const createProfileCommand = new CreateInstanceProfileCommand({
        InstanceProfileName: profileName,
        Tags: this.getCommonTags(profileName),
      });

      await this.iamClient.send(createProfileCommand);
      console.log(`Instance profile ${profileName} create successfully`);

      // Verify the instance profile was created
      const verifyProfileCommand = new GetInstanceProfileCommand({
        InstanceProfileName: profileName,
      });
      const profile = await this.iamClient.send(verifyProfileCommand);

      if (!profile.InstanceProfile) {
        throw new InfrastructureError(
          `Instance profile ${profileName} is not valid`,
          "IAM_PROFILE_VERIFICATION_ERROR"
        );
      }

      console.log("Adding role to instance profile...");
      const addRoleCommand = new AddRoleToInstanceProfileCommand({
        InstanceProfileName: profileName,
        RoleName: roleName,
      });
      await this.iamClient.send(addRoleCommand);
      console.log(`Added role :${roleName} to instance profile ${profileName}`);

      // Wait for instance profile to be ready and propagated
      console.log("Waiting for instance profile to be ready");

      let isProfileReady = false;
      let attempts = 0;

      while (!isProfileReady && attempts < maxAttempts) {
        const delay = Math.min(
          baseDelayMs * Math.pow(1.5, attempts),
          maxDelayMs
        );
        isProfileReady = await this.checkResourceState(profileName);

        if (isProfileReady) {
          console.log(`Instance profile is ready`);
        } else {
          attempts++;
          console.log(
            `Waiting for instance profile to be ready (attempt ${
              attempts + 1
            }/${maxAttempts}), delay: ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (!isProfileReady) {
        throw new InfrastructureError(
          `Instance profile failed to become ready after ${maxAttempts} attempts`,
          "IAM_PROFILE_PROPAGATION_TIMEOUT"
        );
      }

      return profileName;
    } catch (e) {
      // TODO: catch different types of errors?
      if (e instanceof InfrastructureError) {
        throw e;
      }

      throw new InfrastructureError(
        "Failed to create instance profile",
        "IAM_ERROR"
      );
    }
  }

  async deleteInstanceProfile(profileName: string): Promise<void> {
    try {
      // First, get the instance profile to find the role
      const getProfileCommand = new GetInstanceProfileCommand({
        InstanceProfileName: profileName,
      });
      const profile = await this.iamClient.send(getProfileCommand);
      const roleName = profile.InstanceProfile?.Roles?.[0]?.RoleName;

      if (roleName) {
        // Get all attached policies
        const listAttachedPoliciesCommand = new ListAttachedRolePoliciesCommand(
          {
            RoleName: roleName,
          }
        );
        const attachedPolicies = await this.iamClient.send(
          listAttachedPoliciesCommand
        );

        // Detach each policy
        for (const policy of attachedPolicies.AttachedPolicies || []) {
          if (policy.PolicyArn) {
            console.log(`Detaching policy: ${policy.PolicyArn}`);
            const detachCommand = new DetachRolePolicyCommand({
              RoleName: roleName,
              PolicyArn: policy.PolicyArn,
            });
            await this.iamClient.send(detachCommand);
          }
        }

        // Remove role from instance profile
        console.log(
          `Removing role ${roleName} from instance profile ${profileName}`
        );
        const removeRoleCommand = new RemoveRoleFromInstanceProfileCommand({
          InstanceProfileName: profileName,
          RoleName: roleName,
        });
        await this.iamClient.send(removeRoleCommand);

        // Delete the role
        console.log(`Deleting role: ${roleName}`);
        const deleteRoleCommand = new DeleteRoleCommand({
          RoleName: roleName,
        });
        await this.iamClient.send(deleteRoleCommand);
      }

      // Finally, delete the instance profile
      console.log(`Deleting instance profile: ${profileName}`);
      const deleteProfileCommand = new DeleteInstanceProfileCommand({
        InstanceProfileName: profileName,
      });
      await this.iamClient.send(deleteProfileCommand);
    } catch (error) {
      console.error("Error deleting instance profile:", error);
      throw new InfrastructureError(
        "Failed to delete instance profile",
        "IAM_ERROR"
      );
    }
  }

  async getInstanceProfile(): Promise<string | null> {
    try {
      const command = new ListInstanceProfilesCommand({
        PathPrefix: "/",
      });
      const response = await this.iamClient.send(command);
      const profile = response.InstanceProfiles?.find(
        (profile) =>
          profile.Tags?.some(
            (tag) => tag.Key === "AppName" && tag.Value === this.config.appName
          ) &&
          profile.Tags?.some(
            (tag) => tag.Key === "UniqueId" && tag.Value === this.uniqueId
          )
      );
      return profile?.InstanceProfileName || null;
    } catch (error) {
      return null;
    }
  }

  private async verifyIamPermissions(): Promise<void> {
    try {
      // try to list instance profiles to verify permissions
      await this.iamClient.send(new ListInstanceProfilesCommand({}));
    } catch (e: any) {
      if (e.name === "AccessDeniedException") {
        throw new InfrastructureError(
          "Insufficient IAM Permissions to manage instance profiles",
          "IAM_PERMISSION_ERROR"
        );
      }
      throw e;
    }
  }

  private async checkResourceState(profileName: string): Promise<boolean> {
    try {
      const profile = await this.iamClient.send(
        new GetInstanceProfileCommand({ InstanceProfileName: profileName })
      );

      const roles = profile.InstanceProfile?.Roles;
      return roles !== undefined && roles.length > 0;
    } catch (e: any) {
      if (e.name === "NoSuchEntityException") {
        return false;
      }
      throw e;
    }
  }
}

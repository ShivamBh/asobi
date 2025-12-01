import { beforeEach, describe, expect, it, vi } from "vitest";
import { IAMService } from "../../../src/services/IAMService";
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
import { mockConfig } from "../../fixtures/config";
import { iamMock } from "../../setup";
import {
  getInstanceProfile,
  getRoleConfig,
  policies,
} from "../../fixtures/iam";

describe("IAMService", () => {
  let iamService: IAMService;
  let iamClient: IAMClient;

  beforeEach(() => {
    iamMock.reset();
    vi.resetAllMocks();
    iamClient = new IAMClient({ region: mockConfig.region });
    iamService = new IAMService(mockConfig, iamClient);

    (iamService as any).uniqueId = "12345";
  });

  describe("getInstanceProfile", () => {
    it("should return an instance profile if it exists", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({
        InstanceProfiles: [{ ...getInstanceProfile() }],
      });

      const result = await iamService.getInstanceProfile();

      expect(result).toBeDefined();
      expect(iamMock.commandCalls(ListInstanceProfilesCommand)).toHaveLength(1);
    });

    it("should return null when instance profile is not found", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({
        InstanceProfiles: [],
      });

      const result = await iamService.getInstanceProfile();
      expect(result).toBe(null);
    });

    it("should return null if there is an error while fetching instance profile", async () => {
      iamMock
        .on(ListInstanceProfilesCommand)
        .rejects(new Error(`Failed to fetch instance profile`));

      const result = await iamService.getInstanceProfile();

      expect(result).toBe(null);
    });

    it("should return the profile that matches AppName and UniqueId tags", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({
        InstanceProfiles: [
          {
            ...getInstanceProfile(),
            InstanceProfileName: "non-matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: "other-app",
              },
            ],
          },
          {
            ...getInstanceProfile(),
            InstanceProfileName: "matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: mockConfig.appName,
              },
              {
                Key: "UniqueId",
                Value: iamService["uniqueId"],
              },
            ],
          },
        ],
      });

      const result = await iamService.getInstanceProfile();
      expect(result).toBe("matching-profile");
    });

    it("should return null when profiles exist but tags do not match", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({
        InstanceProfiles: [
          {
            ...getInstanceProfile(),
            InstanceProfileName: "non-matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: "other-app",
              },
            ],
          },
          {
            ...getInstanceProfile(),
            InstanceProfileName: "matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: "another-app",
              },
              {
                Key: "UniqueId",
                Value: iamService["uniqueId"],
              },
            ],
          },
        ],
      });

      const result = await iamService.getInstanceProfile();
      expect(result).toBe(null);
    });

    it("should look for instance profile at the '/' path prefix", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({
        InstanceProfiles: [
          {
            ...getInstanceProfile(),
            InstanceProfileName: "non-matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: "other-app",
              },
            ],
          },
          {
            ...getInstanceProfile(),
            InstanceProfileName: "matching-profile",
            Tags: [
              {
                Key: "AppName",
                Value: mockConfig.appName,
              },
              {
                Key: "UniqueId",
                Value: iamService["uniqueId"],
              },
            ],
          },
        ],
      });

      await iamService.getInstanceProfile();
      const calls = iamMock.commandCalls(ListInstanceProfilesCommand);
      expect(calls[0].args[0].input.PathPrefix).toBe("/");
    });

    it("should return null for undefined instance profile response", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({});

      const result = await iamService.getInstanceProfile();
      expect(result).toBe(null);
    });
  });

  describe("createInstanceProfile", () => {
    const mockRoleName = "ec2r-12345";
    const mockProfileName = "ec2p-12345";

    it("should return an instance profile when successfully created", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({});

      iamMock.on(CreateRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      iamMock.on(GetRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      for (const arn of policies) {
        iamMock.on(AttachRolePolicyCommand).resolves({});
      }

      iamMock.on(CreateInstanceProfileCommand).callsFake((input) => {
        return Promise.resolve({
          InstanceProfile: {
            ...getInstanceProfile(input.InstanceProfileName),
          },
        });
      });

      iamMock
        .on(GetInstanceProfileCommand)
        .resolvesOnce({
          InstanceProfile: {
            ...getInstanceProfile(mockProfileName),
            Roles: [],
          },
        })
        .callsFake((input) => ({
          InstanceProfile: {
            ...getInstanceProfile(input.InstanceProfileName),
            Roles: [getRoleConfig(mockRoleName)],
          },
        }));

      iamMock.on(AddRoleToInstanceProfileCommand).resolves({});

      const result = await iamService.createInstanceProfile();

      const createProfileCall = iamMock.commandCalls(
        CreateInstanceProfileCommand
      )[0];
      const expectedProfileName =
        createProfileCall.args[0].input.InstanceProfileName;

      expect(result).toBe(expectedProfileName);

      // Assert sdk call counts
      expect(iamMock.commandCalls(ListInstanceProfilesCommand)).toHaveLength(1);
      expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);
      expect(iamMock.commandCalls(GetRoleCommand)).toHaveLength(1);
      expect(iamMock.commandCalls(AttachRolePolicyCommand)).toHaveLength(3);
      expect(iamMock.commandCalls(CreateInstanceProfileCommand)).toHaveLength(
        1
      );
      expect(
        iamMock.commandCalls(AddRoleToInstanceProfileCommand)
      ).toHaveLength(1);
      expect(
        iamMock.commandCalls(GetInstanceProfileCommand).length
      ).toBeGreaterThanOrEqual(2);

      // Assert inputs to sdk calls
      const createRollCall = iamMock.commandCalls(CreateRoleCommand)[0];
      const attachRolePolicyCall = iamMock.commandCalls(
        AttachRolePolicyCommand
      );

      // Assert input to create role sdk call
      expect(createRollCall.args[0].input.RoleName).toContain("ec2r");
      expect(createRollCall.args[0].input.AssumeRolePolicyDocument).toEqual(
        JSON.stringify({
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
        })
      );
      expect(createRollCall.args[0].input.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Name",
            Value: expect.stringContaining("ec2r"),
          }),
          expect.objectContaining({ Key: "AsobiAppName", Value: "test-app" }),
          expect.objectContaining({ Key: "UniqueId" }),
        ])
      );

      // Assert input to attach role policy sdk calls
      const attachedArns = attachRolePolicyCall.map(
        (c) => c.args[0].input.PolicyArn as string
      );
      expect(attachedArns).toEqual(expect.arrayContaining(policies));

      // Assert input to create instance profile sdk call
      const instanceProfileName =
        createProfileCall.args[0].input.InstanceProfileName;
      expect(instanceProfileName).toContain("ec2p");
      expect(createProfileCall.args[0].input.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Name",
            Value: expect.stringContaining("ec2p"),
          }),
          expect.objectContaining({ Key: "AsobiAppName", Value: "test-app" }),
          expect.objectContaining({ Key: "UniqueId" }),
        ])
      );

      //  Assert input to get instance profile sdk call
      const verifyProfileCall = iamMock.commandCalls(
        GetInstanceProfileCommand
      )[0];
      expect(verifyProfileCall.args[0].input.InstanceProfileName).toEqual(
        instanceProfileName
      );

      // Assert input for adding role to instance profile sdk call
      const addRoleCall = iamMock.commandCalls(
        AddRoleToInstanceProfileCommand
      )[0];
      expect(addRoleCall.args[0].input.InstanceProfileName).toEqual(
        instanceProfileName
      );
      expect(addRoleCall.args[0].input.RoleName).toEqual(
        createRollCall.args[0].input.RoleName
      );
    });

    it("should throw IAM_PERMISSION_ERROR if the current aws profile does not have necessary permissions to create instance profiles", async () => {
      const accessDeniedError = Object.assign(
        new Error(
          "User: arn:aws:iam::123456789012:user/test is not authorized to perform: iam:ListInstanceProfiles"
        ),
        {
          name: "AccessDeniedException",
          $metadata: {
            httpStatusCode: 403,
            requestId: "test-request-id",
          },
        }
      );

      iamMock.on(ListInstanceProfilesCommand).rejects(accessDeniedError);
      await expect(iamService.createInstanceProfile()).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "IAM_PERMISSION_ERROR",
        message: expect.stringContaining("Insufficient IAM Permissions"),
      });
    });

    it("should throw IAM_ROLE_VERIFICATION_FAILED if it fails to create the required role", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({});

      iamMock.on(CreateRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      iamMock.on(GetRoleCommand).resolves({
        $metadata: {},
      });

      await expect(iamService.createInstanceProfile()).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "IAM_ROLE_VERIFICATION_FAILED",
      });
    });

    it("should throw IAM_PROFILE_VERIFICATION_ERROR if no instance profile is returned after creation", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({});

      iamMock.on(CreateRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      iamMock.on(GetRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      for (const arn of policies) {
        iamMock.on(AttachRolePolicyCommand).resolves({});
      }

      iamMock.on(CreateInstanceProfileCommand).callsFake((input) => {
        return Promise.resolve({
          InstanceProfile: {
            ...getInstanceProfile(input.InstanceProfileName),
          },
        });
      });

      iamMock.on(GetInstanceProfileCommand).resolves({});

      await expect(iamService.createInstanceProfile()).rejects.toMatchObject({
        name: "InfrastructureError",
        code: "IAM_PROFILE_VERIFICATION_ERROR",
      });
    });

    it("should throw IAM_PROFILE_PROPRAGATION_TIMEOUT error when the instance profile is not ready after exhausting retries", async () => {
      iamMock.on(ListInstanceProfilesCommand).resolves({});

      iamMock.on(CreateRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      iamMock.on(GetRoleCommand).resolves({
        Role: {
          ...getRoleConfig(),
        },
      });

      for (const arn of policies) {
        iamMock.on(AttachRolePolicyCommand).resolves({});
      }

      iamMock.on(CreateInstanceProfileCommand).callsFake((input) => {
        return Promise.resolve({
          InstanceProfile: {
            ...getInstanceProfile(input.InstanceProfileName),
          },
        });
      });

      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(mockProfileName),
          Roles: [],
        },
      });

      iamMock.on(AddRoleToInstanceProfileCommand).resolves({});

      iamMock
        .on(GetInstanceProfileCommand)
        .resolvesOnce({
          InstanceProfile: {
            ...getInstanceProfile(),
            Roles: [],
          },
        })
        .resolves({
          InstanceProfile: {
            ...getInstanceProfile(),
            Roles: [],
          },
        });

      await expect(
        iamService.createInstanceProfile(4, 20, 1000)
      ).rejects.toMatchObject({
        code: "IAM_PROFILE_PROPAGATION_TIMEOUT",
      });

      // Assert that GetInstanceProfile get called n + 1 times where n is the max_attempts passed to createInstanceProfile
      expect(iamMock.commandCalls(GetInstanceProfileCommand)).toHaveLength(5);
    });
  });

  describe("deleteInstanceProfile", () => {
    const mockProfileName = getInstanceProfile().InstanceProfileName;

    it("should delete an instance profile with profileName successfully with all dependencies", async () => {
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(),
        },
      });

      iamMock.on(ListAttachedRolePoliciesCommand).resolves({
        AttachedPolicies: policies.map((p) => ({ PolicyArn: p })),
      });

      for (const p of policies) {
        iamMock.on(DetachRolePolicyCommand).resolves({});
      }

      iamMock.on(RemoveRoleFromInstanceProfileCommand).resolves({});

      iamMock.on(DeleteRoleCommand).resolves({});

      await iamService.deleteInstanceProfile(mockProfileName);

      expect(
        iamMock.commandCalls(DeleteInstanceProfileCommand)[0].args[0].input
          .InstanceProfileName
      ).toBe(mockProfileName);
      expect(iamMock.commandCalls(DeleteInstanceProfileCommand)).toHaveLength(
        1
      );
    });

    it("should delete instance profile directly if no roles are attached", async () => {
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(),
          Roles: [],
        },
      });
      iamMock.on(DeleteInstanceProfileCommand).resolves({});
      await iamService.deleteInstanceProfile(mockProfileName);
      expect(iamMock.commandCalls(DeleteInstanceProfileCommand)).toHaveLength(
        1
      );
    });

    it("should throw IAM_ERROR if it fails to delete instance profile", async () => {
      iamMock.on(GetInstanceProfileCommand).resolves({
        InstanceProfile: {
          ...getInstanceProfile(),
          Roles: [],
        },
      });

      iamMock
        .on(DeleteInstanceProfileCommand)
        .rejects(new Error("failed to delete instance profile"));

      await expect(
        iamService.deleteInstanceProfile(mockProfileName)
      ).rejects.toMatchObject({
        code: "IAM_ERROR",
        name: "InfrastructureError",
      });
    });
  });
});

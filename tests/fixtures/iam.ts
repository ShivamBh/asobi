import { Role } from "@aws-sdk/client-iam";

export const getInstanceProfile = (name: string = "test-profile") => ({
  Arn: "arn:aws:iam::123456789012:instance-profile/test-profile",
  InstanceProfileName: name,
  CreateDate: new Date(),
  InstanceProfileId: "instance-profile-id",
  Path: "/",
  Roles: [],
});

export const getRoleConfig = (name: string = "ec2-role-12345"): Role => ({
  Arn: `arn:aws:iam::123456789012:role/${name}`,
  CreateDate: new Date("2024-01-01T00:00:00Z"),
  Path: "/",
  RoleId: "AIDACKCEVSQ6C2EXAMPLE",
  RoleName: name,
  AssumeRolePolicyDocument: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

export const policies = [
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  "arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess",
  "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
];

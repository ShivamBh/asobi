import type { SecurityGroup } from "@aws-sdk/client-ec2";

export const getSecurityGroups = (): SecurityGroup[] => [
  {
    GroupId: "sg-0123456789abcdef0",
    GroupName: "test-app-sg",
    Description: "Security group for test-app",
    VpcId: "vpc-0123456789abcdef0",
    OwnerId: "123456789012",
    Tags: [
      { Key: "Name", Value: "test-app-sg" },
      { Key: "AsobiAppName", Value: "test-app" },
      { Key: "Environment", Value: "test" },
    ],
    IpPermissions: [
      {
        IpProtocol: "tcp",
        FromPort: 80,
        ToPort: 80,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTP from anywhere" }],
      },
      {
        IpProtocol: "tcp",
        FromPort: 22,
        ToPort: 22,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "SSH from anywhere" }],
      },
    ],
    IpPermissionsEgress: [
      {
        IpProtocol: "-1",
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "All outbound" }],
      },
    ],
  },
];

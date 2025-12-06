import type { Subnet } from "@aws-sdk/client-ec2";

export const getSubnets = (
  vpcId: string = "vpc-0123456789abcdef0"
): Subnet[] => [
  {
    SubnetId: "subnet-0123456789abcdef0",
    VpcId: vpcId,
    AvailabilityZone: "us-east-1a",
    AvailabilityZoneId: "use1-az1",
    CidrBlock: "10.0.1.0/24",
    State: "available",
    MapPublicIpOnLaunch: true,
    DefaultForAz: false,
    OwnerId: "123456789012",
    AvailableIpAddressCount: 251,
    Tags: [
      { Key: "Name", Value: "public-subnet-1a" },
      { Key: "Environment", Value: "test" },
    ],
  },
  {
    SubnetId: "subnet-0123456789abcdef1",
    VpcId: vpcId,
    AvailabilityZone: "us-east-1b",
    AvailabilityZoneId: "use1-az2",
    CidrBlock: "10.0.2.0/24",
    State: "available",
    MapPublicIpOnLaunch: true,
    DefaultForAz: false,
    OwnerId: "123456789012",
    AvailableIpAddressCount: 251,
    Tags: [
      { Key: "Name", Value: "public-subnet-1b" },
      { Key: "Environment", Value: "test" },
    ],
  },
];

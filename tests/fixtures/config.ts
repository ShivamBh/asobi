import { InfrastructureConfig } from "../../src/types";

export const mockConfig: InfrastructureConfig = {
  appName: "test-app",
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  amiId: "ami-0c55b159cbfafe1f0",
  instanceType: "t3.micro",
  type: "load-balanced-web-service",
  resources: {
    vpcId: "vpc-12345678",
    subnetIds: ["subnet-12345678", "subnet-87654321"],
    securityGroupIds: ["sg-12345678"],
    routeTableId: "rtb-12345678",
    internetGatewayId: "igw-12345678",
    instanceProfileName: "test-app-instance-profile",
    certificateArn:
      "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555",
    instanceId: "i-1234567890abcdef0",
    loadBalancerArn:
      "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test-alb/50dc6c495c0c9188",
    targetGroupArn:
      "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test-tg/50dc6c495c0c9188",
  },
};

export const createMockConfig = (
  overrides?: Partial<InfrastructureConfig>,
  resourceOverrides?: Partial<NonNullable<InfrastructureConfig["resources"]>>
): InfrastructureConfig => ({
  ...mockConfig,
  ...overrides,
  resources: {
    ...mockConfig.resources,
    ...resourceOverrides,
  },
});

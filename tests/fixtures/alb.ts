import type {
  Listener,
  LoadBalancer,
  TargetGroup,
} from "@aws-sdk/client-elastic-load-balancing-v2";

export const getLoadBalancer = (
  name: string = "test-app-alb",
  arn: string = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test-app-alb/50dc6c495c0c9188"
): LoadBalancer => ({
  LoadBalancerArn: arn,
  DNSName: `${name}-1234567890.us-east-1.elb.amazonaws.com`,
  CanonicalHostedZoneId: "Z35SXDOTRQ7X7K",
  CreatedTime: new Date("2024-01-01T00:00:00Z"),
  LoadBalancerName: name,
  Scheme: "internet-facing",
  VpcId: "vpc-0123456789abcdef0",
  State: {
    Code: "active",
  },
  Type: "application",
  AvailabilityZones: [
    {
      ZoneName: "us-east-1a",
      SubnetId: "subnet-0123456789abcdef0",
      LoadBalancerAddresses: [],
    },
    {
      ZoneName: "us-east-1b",
      SubnetId: "subnet-0123456789abcdef1",
      LoadBalancerAddresses: [],
    },
  ],
  SecurityGroups: ["sg-0123456789abcdef0"],
  IpAddressType: "ipv4",
});

export const getTargetGroup = (
  name: string = "test-app-tg",
  arn: string = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test-app-tg/50dc6c495c0c9188",
  vpcId: string = "vpc-0123456789abcdef0"
): TargetGroup => ({
  TargetGroupArn: arn,
  TargetGroupName: name,
  Protocol: "HTTP",
  Port: 80,
  VpcId: vpcId,
  HealthCheckProtocol: "HTTP",
  HealthCheckPort: "traffic-port",
  HealthCheckEnabled: true,
  HealthCheckIntervalSeconds: 30,
  HealthCheckTimeoutSeconds: 5,
  HealthyThresholdCount: 5,
  UnhealthyThresholdCount: 2,
  HealthCheckPath: "/health",
  Matcher: {
    HttpCode: "200",
  },
  LoadBalancerArns: [
    "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test-app-alb/50dc6c495c0c9188",
  ],
  TargetType: "instance",
  ProtocolVersion: "HTTP1",
  IpAddressType: "ipv4",
});

export const getListener = (
  listenerArn: string = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/test-app-alb/50dc6c495c0c9188/abcdef1234567890",
  loadBalancerArn: string = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test-app-alb/50dc6c495c0c9188",
  targetGroupArn: string = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test-app-tg/50dc6c495c0c9188"
): Listener => ({
  ListenerArn: listenerArn,
  LoadBalancerArn: loadBalancerArn,
  Port: 80,
  Protocol: "HTTP",
  DefaultActions: [
    {
      Type: "forward",
      TargetGroupArn: targetGroupArn,
      Order: 1,
      ForwardConfig: {
        TargetGroups: [
          {
            TargetGroupArn: targetGroupArn,
            Weight: 1,
          },
        ],
        TargetGroupStickinessConfig: {
          Enabled: false,
        },
      },
    },
  ],
});

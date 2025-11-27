import { mockClient } from "aws-sdk-client-mock";
import { EC2Client } from "@aws-sdk/client-ec2";
import { IAMClient } from "@aws-sdk/client-iam";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { afterEach, beforeEach, beforeAll, afterAll } from "vitest";

export const ec2Mock = mockClient(EC2Client);
export const iamMock = mockClient(IAMClient);
export const elbMock = mockClient(ElasticLoadBalancingV2Client);

beforeEach(() => {
  ec2Mock.reset();
  iamMock.reset();
  elbMock.reset();
});

afterEach(() => {});

// Disable console outputs during tests
beforeAll(() => {
  global.console = {
    ...console,
    log: () => {},
    error: console.error,
    warn: console.warn,
  };
});

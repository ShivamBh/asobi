import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALBService } from "../../../src/services/ALBService";
import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  DeleteListenerCommand,
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  DeregisterTargetsCommand,
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ec2Mock, elbMock } from "../../setup";
import { mockConfig } from "../../fixtures/config";
import {
  getListener,
  getLoadBalancer,
  getTargetGroup,
} from "../../fixtures/alb";

const mocklb = getLoadBalancer();
const mockTargetGroup = getTargetGroup();
const mockListener = getListener();
const mockVpcId = "vpc-0123456789abcdef0";
const mockSubnetIds = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"];
const mockSgId = "sg-0123456789abcdef0";

describe("ALBService", () => {
  let albService: ALBService;
  let albClient: ElasticLoadBalancingV2Client;

  beforeEach(() => {
    elbMock.reset();
    vi.resetAllMocks();
    vi.useFakeTimers();

    albClient = new ElasticLoadBalancingV2Client({ region: mockConfig.region });
    albService = new ALBService(mockConfig, albClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("fetchLoadBalancer", () => {
    it("return an elastic load balancer object", async () => {
      elbMock.on(DescribeLoadBalancersCommand).resolves({
        LoadBalancers: [{ ...getLoadBalancer() }],
      });

      const result = await albService.fetchLoadbalancer(
        mocklb.LoadBalancerArn as string
      );
      expect(result).toEqual(mocklb);
    });

    it("should throw an ALB_ERROR if fetch returns with empty or undefined response", async () => {
      elbMock.on(DescribeLoadBalancersCommand).resolves({});

      await expect(
        albService.fetchLoadbalancer(mocklb.LoadBalancerArn as string)
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
      });
    });

    it("should throw an ALB_ERROR if the fetch fails", async () => {
      elbMock
        .on(DescribeLoadBalancersCommand)
        .rejects(new Error(`Failed to fetch load balancer`));

      await expect(
        albService.fetchLoadbalancer(mocklb.LoadBalancerArn as string)
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
      });
    });
  });

  describe("createLoadBalancer", () => {
    it("should create an application load balancer with correct dependencies", async () => {
      elbMock.on(CreateLoadBalancerCommand).resolves({
        LoadBalancers: [{ ...mocklb }],
      });
      elbMock.on(CreateTargetGroupCommand).resolves({
        TargetGroups: [{ ...mockTargetGroup }],
      });
      elbMock.on(CreateListenerCommand).resolves({
        Listeners: [{ ...mockListener }],
      });

      const result = await albService.createLoadBalancer(
        mockVpcId,
        mockSubnetIds,
        mockSgId
      );

      expect(result).toEqual({
        loadBalancerArn: mocklb.LoadBalancerArn,
        targetGroupArn: mockTargetGroup.TargetGroupArn,
      });

      expect(elbMock.commandCalls(CreateLoadBalancerCommand)).toHaveLength(1);
      expect(elbMock.commandCalls(CreateTargetGroupCommand)).toHaveLength(1);
      expect(elbMock.commandCalls(CreateListenerCommand)).toHaveLength(1);

      // make sure application load balancer is being created
      expect(
        elbMock.commandCalls(CreateLoadBalancerCommand)[0].args[0].input.Type
      ).toEqual("application");
    });

    it("should throw an ALB_ERROR if any of creation steps fail", async () => {
      elbMock
        .on(CreateListenerCommand)
        .rejects(new Error(`Failed to create ALB`));

      await expect(
        albService.createLoadBalancer(mockVpcId, mockSubnetIds, mockSgId)
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
      });
    });
  });

  describe("deleteLoadBalancer", () => {
    it("should delete load balancer its dependencies in correct sequence", async () => {
      elbMock
        .on(DescribeListenersCommand)
        .resolves({ Listeners: [{ ...mockListener }] });
      elbMock.on(DeleteListenerCommand).resolves({});
      elbMock.on(DeleteTargetGroupCommand).resolves({});
      elbMock.on(DeleteLoadBalancerCommand).resolves({});

      await albService.deleteLoadBalancer(
        mocklb.LoadBalancerArn as string,
        mockTargetGroup.TargetGroupArn as string
      );

      const describeListenerCall = elbMock.commandCalls(
        DescribeListenersCommand
      );
      const deleteListenerCall = elbMock.commandCalls(DeleteListenerCommand);
      const deleteTGCall = elbMock.commandCalls(DeleteTargetGroupCommand);
      const deleteLBCall = elbMock.commandCalls(DeleteLoadBalancerCommand);

      // Assert the delete command
      expect(deleteLBCall).toHaveLength(1);

      // Assert the call sequence
      const callSequence = elbMock
        .calls()
        .map((c) => c.args[0].constructor.name);

      expect(callSequence).toEqual([
        "DescribeListenersCommand",
        "DeleteListenerCommand",
        "DeleteTargetGroupCommand",
        "DeleteLoadBalancerCommand",
      ]);

      // Assert the inputs
      expect(describeListenerCall[0].args[0].input.LoadBalancerArn).toEqual(
        mocklb.LoadBalancerArn
      );
      expect(deleteListenerCall[0].args[0].input.ListenerArn).toEqual(
        mockListener.ListenerArn
      );
      expect(deleteTGCall[0].args[0].input.TargetGroupArn).toEqual(
        mockTargetGroup.TargetGroupArn
      );
      expect(deleteLBCall[0].args[0].input.LoadBalancerArn).toEqual(
        mocklb.LoadBalancerArn
      );
    });

    it("should throw ALB_ERROR if load balancer deletion fails", async () => {
      elbMock
        .on(DescribeListenersCommand)
        .resolves({ Listeners: [{ ...mockListener }] });
      elbMock.on(DeleteListenerCommand).resolves({});
      elbMock.on(DeleteTargetGroupCommand).resolves({});
      elbMock
        .on(DeleteLoadBalancerCommand)
        .rejects(new Error(`Failed to delete load balancer`));

      await expect(
        albService.deleteLoadBalancer(
          mocklb.LoadBalancerArn as string,
          mockTargetGroup.TargetGroupArn as string
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
        name: "InfrastructureError",
      });
    });

    it("should throw ALB_ERROR if listener deletion fails", async () => {
      elbMock
        .on(DescribeListenersCommand)
        .resolves({ Listeners: [{ ...mockListener }] });
      elbMock
        .on(DeleteListenerCommand)
        .rejects(new Error(`Failed to delete load balancer`));

      await expect(
        albService.deleteLoadBalancer(
          mocklb.LoadBalancerArn as string,
          mockTargetGroup.TargetGroupArn as string
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
        name: "InfrastructureError",
      });
    });

    it("should throw ALB_ERROR if target group deletion fails", async () => {
      elbMock
        .on(DescribeListenersCommand)
        .resolves({ Listeners: [{ ...mockListener }] });
      elbMock.on(DeleteListenerCommand).resolves({});
      elbMock
        .on(DeleteTargetGroupCommand)
        .rejects(new Error(`Failed to delete load balancer`));

      await expect(
        albService.deleteLoadBalancer(
          mocklb.LoadBalancerArn as string,
          mockTargetGroup.TargetGroupArn as string
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
        name: "InfrastructureError",
      });
    });

    it("should throw ALB_ERROR if fetching listeners fails", async () => {
      elbMock
        .on(DescribeListenersCommand)
        .rejects(new Error(`Failed to delete load balancer`));

      await expect(
        albService.deleteLoadBalancer(
          mocklb.LoadBalancerArn as string,
          mockTargetGroup.TargetGroupArn as string
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
        name: "InfrastructureError",
      });
    });
  });

  describe("registerTarget", () => {
    const mockInstanceId = "i-12345";
    it("should register a target group with ec2 instance", async () => {
      elbMock.on(RegisterTargetsCommand).resolves({});
      await albService.registerTarget(
        mockTargetGroup.TargetGroupArn as string,
        mockInstanceId
      );

      const registerCall = elbMock.commandCalls(RegisterTargetsCommand);

      expect(registerCall).toHaveLength(1);
      expect(registerCall[0].args[0].input.TargetGroupArn).toEqual(
        mockTargetGroup.TargetGroupArn
      );
      expect(registerCall[0].args[0].input.Targets![0].Id).toEqual(
        mockInstanceId
      );
    });

    it("should throw ALB_ERROR if target group registration fails", async () => {
      elbMock
        .on(RegisterTargetsCommand)
        .rejects(new Error(`Failed to register target group`));
      await expect(
        albService.registerTarget(
          mockTargetGroup.TargetGroupArn as string,
          mockInstanceId
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
      });
    });
  });

  describe("deregisterTarget", () => {
    const mockInstanceId = "i-12345";
    it("should deregister a target group with ec2 instance", async () => {
      elbMock.on(DeregisterTargetsCommand).resolves({});
      await albService.deregisterTarget(
        mockTargetGroup.TargetGroupArn as string,
        mockInstanceId
      );

      const deregisterCall = elbMock.commandCalls(DeregisterTargetsCommand);

      expect(deregisterCall).toHaveLength(1);
      expect(deregisterCall[0].args[0].input.TargetGroupArn).toEqual(
        mockTargetGroup.TargetGroupArn
      );
      expect(deregisterCall[0].args[0].input.Targets![0].Id).toEqual(
        mockInstanceId
      );
    });

    it("should throw ALB_ERROR if target group deregistration fails", async () => {
      elbMock
        .on(DeregisterTargetsCommand)
        .rejects(new Error(`Failed to register target group`));
      await expect(
        albService.deregisterTarget(
          mockTargetGroup.TargetGroupArn as string,
          mockInstanceId
        )
      ).rejects.toMatchObject({
        code: "ALB_ERROR",
      });
    });
  });

  describe("waitForHealthCheck", () => {
    const mockInstanceId = "i-12345";
    const maxAttempts = 5;
    const maxWaitMs = 10000;
    it("should return true if target health is in 'healthy' state", async () => {
      elbMock.on(DescribeTargetHealthCommand).resolves({
        TargetHealthDescriptions: [
          {
            TargetHealth: {
              State: "healthy",
            },
          },
        ],
      });

      const resultPromise = albService.waitForHealthCheck(
        mockTargetGroup.TargetGroupArn as string,
        mockInstanceId,
        maxAttempts,
        maxWaitMs
      );

      vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual(true);
    });

    it("should return false after max_attempts are exhausted with unhealthy state", async () => {
      elbMock.on(DescribeTargetHealthCommand).resolves({
        TargetHealthDescriptions: [
          {
            TargetHealth: {
              State: "unhealthy",
            },
          },
        ],
      });

      const resultPromise = albService.waitForHealthCheck(
        mockTargetGroup.TargetGroupArn as string,
        mockInstanceId,
        maxAttempts,
        maxWaitMs
      );

      vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe(false);
      expect(elbMock.commandCalls(DescribeTargetHealthCommand)).toHaveLength(
        maxAttempts
      );
    });
  });
});

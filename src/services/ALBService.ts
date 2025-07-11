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
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2,
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { BaseService } from "./base";
import { InfrastructureConfig } from "../types";
import { InfrastructureError } from "../utls/errors";

export class ALBService extends BaseService {
  private readonly albClient: ElasticLoadBalancingV2Client;
  constructor(
    config: InfrastructureConfig,
    albClient: ElasticLoadBalancingV2Client
  ) {
    super(config);
    this.albClient = albClient;
  }

  async createLoadBalancer(
    vpcId: string,
    subnetIds: string[],
    securityGroupId: string
  ): Promise<{ loadBalancerArn: string; targetGroupArn: string }> {
    try {
      console.log(`Creating Application Load Balancer...`);
      const loadBalancerName = this.getResourceName("alb");

      // Create the load balancer
      const createLoadBalancerCommand = new CreateLoadBalancerCommand({
        Name: loadBalancerName,
        Subnets: subnetIds,
        SecurityGroups: [securityGroupId],
        Scheme: "internet-facing",
        Type: "application",
        Tags: this.getCommonTags(loadBalancerName),
      });
      const loadBalancer = await this.albClient.send(createLoadBalancerCommand);

      if (!loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn) {
        throw new InfrastructureError(
          "Failed to create load balancer",
          "ALB_ERROR"
        );
      }

      const loadBalancerArn = loadBalancer.LoadBalancers[0].LoadBalancerArn;

      // Create target group

      console.log("Creating Target Group...");
      const targetGroupName = this.getResourceName("target-group");
      const createTargetGroupCommand = new CreateTargetGroupCommand({
        Name: targetGroupName,
        Protocol: "HTTP",
        Port: 80,
        VpcId: vpcId,
        TargetType: "instance",
        HealthCheckPath: "/",
        HealthCheckIntervalSeconds: 30,
        HealthCheckTimeoutSeconds: 5,
        HealthyThresholdCount: 2,
        UnhealthyThresholdCount: 2,
        Tags: this.getCommonTags(targetGroupName),
      });

      const targetGroup = await this.albClient.send(createTargetGroupCommand);

      if (!targetGroup.TargetGroups?.[0]?.TargetGroupArn) {
        throw new InfrastructureError(
          "Failed to create target group",
          "ALB_ERROR"
        );
      }

      const targetGroupArn = targetGroup.TargetGroups[0].TargetGroupArn;

      // Create Listener
      console.log("Create Listener...");
      const createListenerCommand = new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTP",
        Port: 80,
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: targetGroupArn,
          },
        ],
      });

      await this.albClient.send(createListenerCommand);

      return {
        loadBalancerArn,
        targetGroupArn,
      };
    } catch (e) {
      console.error("Error creating load balancer: ", e);
      throw new InfrastructureError(
        "Failed to create load balancer",
        "ALB_ERROR"
      );
    }
  }

  async deleteLoadBalancer(
    loadBalancerArn: string,
    targetGroupArn: string
  ): Promise<void> {
    try {
      // Get all listeners
      const describeListenersCommand = new DescribeListenersCommand({
        LoadBalancerArn: loadBalancerArn,
      });

      const listeners = await this.albClient.send(describeListenersCommand);

      // Delete all listeners
      for (const listener of listeners.Listeners || []) {
        if (listener.ListenerArn) {
          console.log(`Deleting listener: ${listener.ListenerArn}`);
          const deleteListenerCommand = new DeleteListenerCommand({
            ListenerArn: listener.ListenerArn,
          });
          await this.albClient.send(deleteListenerCommand);
        }
      }

      // Delete target groups
      console.log(`Deleting target group: ${targetGroupArn}`);
      const deleteTargetGroupCommand = new DeleteTargetGroupCommand({
        TargetGroupArn: targetGroupArn,
      });

      await this.albClient.send(deleteTargetGroupCommand);

      // Delete load balancer
      console.log(`Deleteing load balancer :${loadBalancerArn}`);
      const deleteLoadBalancerCommand = new DeleteLoadBalancerCommand({
        LoadBalancerArn: loadBalancerArn,
      });

      await this.albClient.send(deleteLoadBalancerCommand);
    } catch (e) {
      console.error("Error deleting load balancer: ", e);
      throw new InfrastructureError(
        "Failed to delete load balancer",
        "ALB_ERROR"
      );
    }
  }

  async registerTarget(
    targetGroupArn: string,
    instanceId: string
  ): Promise<void> {
    try {
      console.log(
        `Registering instance ${instanceId} with target group: ${targetGroupArn}....`
      );
      const registerTargetsCommand = new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [
          {
            Id: instanceId,
            Port: 80,
          },
        ],
      });

      await this.albClient.send(registerTargetsCommand);
    } catch (e) {
      console.error("Error registering target", e);
      throw new InfrastructureError("Failed to register target", "ALB_ERROR");
    }
  }

  async deregisterTarget(
    targetGroupArn: string,
    instanceId: string
  ): Promise<void> {
    try {
      console.log(
        `Deregistering instance: ${instanceId} from target group: ${targetGroupArn}`
      );
      const deregisterCommand = new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [
          {
            Id: instanceId,
            Port: 80,
          },
        ],
      });

      await this.albClient.send(deregisterCommand);
    } catch (e) {
      console.error("Error while deregistering target:", e);
      throw new InfrastructureError("Failed to deregister target", "ALB_ERROR");
    }
  }

  // async getLoadBalancer(): Promise<{
  //   loadBalancerArn: string;
  //   targetGroupArn: string;
  // } | null> {
  //   try {

  //     const command = new DescribeLoadBalancersCommand({})
  //     const response = await this.albClient.send(command)

  //     if (!response.LoadBalancers) {
  //       throw new InfrastructureError(
  //         "Could not find load balancers",
  //         "ALB_ERROR"
  //       )
  //     }

  //     const loadBalancer = response.LoadBalancers.find(lb =>
  //       lb.Tags
  //     )

  //   } catch (e) {
  //     console.error("Error getting load balancer", e)
  //   }
  // }

  async waitForHealthCheck(
    targetGroupArn: string,
    instanceId: string,
    maxAttempts: number = 30,
    waitTime: number = 30000
  ): Promise<boolean> {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const command = new DescribeTargetHealthCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [
            {
              Id: instanceId,
              Port: 80,
            },
          ],
        });

        const response = await this.albClient.send(command);
        const targetHealth = response.TargetHealthDescriptions?.[0];

        if (targetHealth?.TargetHealth?.State === "healthy") {
          return true;
        }

        console.log(
          `Waiting for target health check...(attemps ${attempts}/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        attempts++;
      } catch (e) {
        console.error(
          `Error checking target health (attempt ${attempts}/${maxAttempts})`
        );

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        attempts++;
      }
    }
    return false;
  }
}

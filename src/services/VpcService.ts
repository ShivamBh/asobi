import {
  EC2Client,
  CreateVpcCommand,
  DeleteVpcCommand,
  DescribeVpcsCommand,
  CreateInternetGatewayCommand,
  AttachInternetGatewayCommand,
  DeleteInternetGatewayCommand,
  DetachInternetGatewayCommand,
  CreateRouteTableCommand,
  CreateRouteCommand,
  DeleteRouteTableCommand,
  DescribeRouteTablesCommand,
  DescribeInternetGatewaysCommand,
  DescribeAvailabilityZonesCommand,
  DescribeSubnetsCommand,
  Vpc,
} from "@aws-sdk/client-ec2";
import inquirer from "inquirer";
import { BaseService } from "./base";
import { InfrastructureError } from "../utls/errors";

export class VpcService extends BaseService {
  private readonly ec2Client: EC2Client;

  constructor(config: any, ec2Client: EC2Client) {
    super(config);
    this.ec2Client = ec2Client;
  }

  async createVpc(): Promise<{
    vpcId: string;
    routeTableId: string;
    internetGatewayId: string;
  }> {
    try {
      console.log("Creating VPC...");
      const command = new CreateVpcCommand({
        CidrBlock: "10.0.0.0/16",
        TagSpecifications: [
          {
            ResourceType: "vpc",
            Tags: this.getCommonTags(this.getResourceName("vpc")),
          },
        ],
      });
      const response = await this.ec2Client.send(command);
      const vpcId = response.Vpc?.VpcId || "";

      if (!vpcId) {
        throw new InfrastructureError("Failed to create VPC", "VPC_ERROR");
      }

      console.log("Creating Internet Gateway...");
      const igwCommand = new CreateInternetGatewayCommand({
        TagSpecifications: [
          {
            ResourceType: "internet-gateway",
            Tags: this.getCommonTags(this.getResourceName("igw")),
          },
        ],
      });
      const igwResponse = await this.ec2Client.send(igwCommand);
      const igwId = igwResponse.InternetGateway?.InternetGatewayId;

      if (!igwId) {
        throw new InfrastructureError(
          "Failed to create Internet Gateway",
          "IGW_ERROR"
        );
      }

      console.log("Attaching Internet Gateway to VPC...");
      const attachCommand = new AttachInternetGatewayCommand({
        InternetGatewayId: igwId,
        VpcId: vpcId,
      });
      await this.ec2Client.send(attachCommand);

      console.log("Creating Route Table...");
      const rtCommand = new CreateRouteTableCommand({
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: "route-table",
            Tags: this.getCommonTags(this.getResourceName("rt")),
          },
        ],
      });
      const rtResponse = await this.ec2Client.send(rtCommand);
      const routeTableId = rtResponse.RouteTable?.RouteTableId;

      if (!routeTableId) {
        throw new InfrastructureError(
          "Failed to create Route Table",
          "RT_ERROR"
        );
      }

      console.log("Adding route to Internet Gateway...");
      const routeCommand = new CreateRouteCommand({
        RouteTableId: routeTableId,
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: igwId,
      });
      await this.ec2Client.send(routeCommand);

      return { vpcId, routeTableId, internetGatewayId: igwId };
    } catch (error) {
      console.error(error);
      throw new InfrastructureError("Failed to create VPC", "VPC_ERROR");
    }
  }

  private async createRouteTable(vpcId: string): Promise<string> {
    try {
      console.log("Creating Route Table...");
      const rtCommand = new CreateRouteTableCommand({
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: "route-table",
            Tags: this.getCommonTags(this.getResourceName("rt")),
          },
        ],
      });
      const rtResponse = await this.ec2Client.send(rtCommand);
      const routeTableId = rtResponse.RouteTable?.RouteTableId;

      if (!routeTableId) {
        throw new InfrastructureError(
          "Failed to create Route Table",
          "RT_ERROR"
        );
      }

      return routeTableId;
    } catch (error) {
      console.error(error);
      throw new InfrastructureError("Failed to create Route Table", "RT_ERROR");
    }
  }

  private async createInternetGateway(vpcId: string): Promise<string> {
    try {
      console.log("Creating Internet Gateway...");
      const igwCommand = new CreateInternetGatewayCommand({
        TagSpecifications: [
          {
            ResourceType: "internet-gateway",
            Tags: this.getCommonTags(this.getResourceName("igw")),
          },
        ],
      });
      const igwResponse = await this.ec2Client.send(igwCommand);
      const igwId = igwResponse.InternetGateway?.InternetGatewayId;

      if (!igwId) {
        throw new InfrastructureError(
          "Failed to create Internet Gateway",
          "IGW_ERROR"
        );
      }

      console.log("Attaching Internet Gateway to VPC...");
      const attachCommand = new AttachInternetGatewayCommand({
        InternetGatewayId: igwId,
        VpcId: vpcId,
      });
      await this.ec2Client.send(attachCommand);

      return igwId;
    } catch (error) {
      console.error(error);
      throw new InfrastructureError(
        "Failed to create Internet Gateway",
        "IGW_ERROR"
      );
    }
  }

  async deleteVpc(
    vpcId: string,
    routeTableId: string,
    internetGatewayId: string
  ): Promise<void> {
    try {
      // Delete route table
      const deleteRtCommand = new DeleteRouteTableCommand({
        RouteTableId: routeTableId,
      });
      await this.ec2Client.send(deleteRtCommand);

      // Detach and delete internet gateway
      const detachCommand = new DetachInternetGatewayCommand({
        InternetGatewayId: internetGatewayId,
        VpcId: vpcId,
      });
      await this.ec2Client.send(detachCommand);

      const deleteIgwCommand = new DeleteInternetGatewayCommand({
        InternetGatewayId: internetGatewayId,
      });
      await this.ec2Client.send(deleteIgwCommand);

      // Delete VPC
      const deleteVpcCommand = new DeleteVpcCommand({
        VpcId: vpcId,
      });
      await this.ec2Client.send(deleteVpcCommand);
    } catch (error) {
      throw new InfrastructureError("Failed to delete VPC", "VPC_ERROR");
    }
  }

  async listExistingVpcs() {
    try {
      console.log("Fetching existing VPCs...");
      const command = new DescribeVpcsCommand({});
      const response = await this.ec2Client.send(command);

      if (!response.Vpcs || response.Vpcs.length === 0) {
        console.log("No existing VPCs found.");
        return [];
      }

      return response.Vpcs.map((vpc) => ({
        name: `${vpc.VpcId} (${
          vpc.Tags?.find((tag) => tag.Key === "Name")?.Value || "Unnamed"
        })`,
        value: vpc.VpcId || "",
        meta: vpc,
      }));
    } catch (error) {
      console.error("Error fetching VPCs:", error);
      throw new InfrastructureError(
        "Failed to list existing VPCs",
        "VPC_LIST_ERROR"
      );
    }
  }

  async fetchVpc(vpcId: string) {
    const command = new DescribeVpcsCommand({
      VpcIds: [vpcId],
    });
    const response = await this.ec2Client.send(command);
    return response?.Vpcs?.[0];
  }

  async selectOrCreateVpc(): Promise<{
    vpcId: string;
    routeTableId: string;
    internetGatewayId: string;
    cidrBlock: string;
    availabilityZones: string[];
    isNewVpc: boolean;
    subnets?: string[];
  }> {
    let routeTableId: string;
    let internetGatewayId: string;
    try {
      // Get list of existing VPCs
      const vpcs = await this.listExistingVpcs();
      if (vpcs.length > 0) {
        // Ask user if they want to use an existing VPC
        const { useExisting } = await inquirer.prompt([
          {
            type: "confirm",
            name: "useExisting",
            message: "Do you want to use an existing VPC?",
            default: true,
          },
        ]);

        if (useExisting) {
          // Get existing VPCs
          const vpcs = await this.listExistingVpcs();

          if (vpcs.length === 0) {
            throw new InfrastructureError(
              "No VPCs found in this region",
              "VPC_NOT_FOUND"
            );
          }

          const { selectedVpc } = await inquirer.prompt([
            {
              type: "list",
              name: "selectedVpc",
              message: "Select a VPC:",
              choices: vpcs.map((vpc) => ({
                name: `${vpc.meta.VpcId}`,
                value: vpc.meta.VpcId,
              })),
            },
          ]);

          const vpcDetails = await this.getVpcDetails(selectedVpc);

          // Get subnets for selected VPC
          const subnets = await this.getSubnets(selectedVpc);

          const { needsConfiguration, internetGateway, routeTable } =
            await this.verifyVpcConfiguration(vpcDetails.meta.VpcId as string);

          const { internetGatewayId, routeTableId } =
            await this.configureExistingVpc(
              vpcDetails.meta.VpcId as string,
              internetGateway,
              routeTable
            );

          if (subnets.length === 0) {
            return {
              ...vpcDetails,
              isNewVpc: false,
              subnets: vpcDetails.subnets,
              availabilityZones: vpcDetails.AvailabilityZones,
              cidrBlock: vpcDetails.CidrBlock,
              internetGatewayId: internetGatewayId,
              vpcId: vpcDetails.meta.VpcId as string,
              routeTableId: routeTableId,
            };
          }

          if (subnets.length > 0) {
            const { selectedSubnets } = await inquirer.prompt([
              {
                type: "checkbox",
                name: "selectedSubnets",
                message: "Select subnets(2 recommended)",
                choices: subnets.map((subnet) => ({
                  name: `${subnet.SubnetId} (${subnet.AvailabilityZone})`,
                  value: subnet.SubnetId,
                })),
              },
            ]);

            return {
              isNewVpc: false,
              subnets: selectedSubnets,
              // @ts-ignore
              availabilityZones: vpcDetails.AvailabilityZones,
              cidrBlock: vpcDetails.CidrBlock,
              internetGatewayId: internetGatewayId,
              routeTableId: routeTableId,
              vpcId: vpcDetails.meta.VpcId as string,
            };
          }

          // const { vpcId } = await inquirer.prompt([
          //   {
          //     type: "list",
          //     name: "vpcId",
          //     message: "Select a VPC:",
          //     choices: vpcs.map((vpc) => ({
          //       name: `${vpc.name} (${vpc.value})`,
          //       value: vpc.value,
          //     })),
          //   },
          // ]);

          // // Get VPC details
          // const vpcDetails = await this.getVpcDetails(vpcId);
          // if (!vpcDetails) {
          //   throw new Error("Failed to get VPC details");
          // }

          // // Verify and configure VPC if needed
          // const { needsConfiguration, routeTableId, internetGatewayId } =
          //   await this.verifyVpcConfiguration(vpcId);

          // if (needsConfiguration) {
          //   console.log("Configuring existing VPC...");
          //   const configResult = await this.configureExistingVpc(vpcId);
          //   return {
          //     vpcId,
          //     routeTableId: configResult.routeTableId,
          //     internetGatewayId: configResult.internetGatewayId,
          //     cidrBlock: vpcDetails.CidrBlock,
          //     availabilityZones: vpcDetails.AvailabilityZones,
          //     isNewVpc: false,
          //   };
          // }

          // return {
          //   vpcId,
          //   routeTableId: routeTableId!,
          //   internetGatewayId: internetGatewayId!,
          //   cidrBlock: vpcDetails.CidrBlock,
          //   availabilityZones: vpcDetails.AvailabilityZones,
          //   isNewVpc: false,
          //   subnets: vpcDetails.subnets,
          // };
        }
      }

      // Create new VPC
      const { vpcId, routeTableId, internetGatewayId } = await this.createVpc();

      // Get VPC details for new VPC
      const vpcDetails = await this.getVpcDetails(vpcId);
      if (!vpcDetails) {
        throw new Error("Failed to get VPC details");
      }

      return {
        vpcId,
        routeTableId,
        internetGatewayId,
        cidrBlock: vpcDetails.CidrBlock,
        availabilityZones: vpcDetails.AvailabilityZones,
        isNewVpc: true,
      };
    } catch (error) {
      console.error("Error in selectOrCreateVpc:", error);
      throw new InfrastructureError(
        error instanceof Error ? error.message : "Unknown error occurred",
        "VPC_SELECTION_FAILED"
      );
    }
  }

  private async getSubnets(vpcId: string) {
    const command = new DescribeSubnetsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    });
    const response = await this.ec2Client.send(command);
    return response.Subnets || [];
  }

  private async verifyVpcConfiguration(vpcId: string): Promise<{
    routeTable: { id: string | null; configured: boolean };
    internetGateway: { id: string | null; configured: boolean };
    needsConfiguration: boolean;
  }> {
    try {
      // Check for internet gateway
      const igwCommand = new DescribeInternetGatewaysCommand({
        Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }],
      });
      const igwResponse = await this.ec2Client.send(igwCommand);
      const internetGatewayId =
        igwResponse.InternetGateways?.[0]?.InternetGatewayId || null;

      // Check for route table with internet access
      const rtCommand = new DescribeRouteTablesCommand({
        Filters: [{ Name: "vpc-id", Values: [vpcId] }],
      });
      const rtResponse = await this.ec2Client.send(rtCommand);
      const routeTable = rtResponse.RouteTables?.find((rt) =>
        rt.Routes?.some(
          (route) =>
            route.DestinationCidrBlock === "0.0.0.0/0" &&
            route.GatewayId === internetGatewayId
        )
      );
      const routeTableId = routeTable?.RouteTableId || null;

      return {
        routeTable: {
          id: routeTableId,
          configured: routeTableId ? true : false,
        },
        internetGateway: {
          id: internetGatewayId,
          configured: internetGatewayId ? true : false,
        },
        needsConfiguration: !routeTableId || !internetGatewayId,
      };
    } catch (error) {
      console.error("Error verifying VPC configuration:", error);
      throw new InfrastructureError(
        "Error verifying VPC configuration",
        "VPC_ERROR"
      );
    }
  }

  private async configureExistingVpc(
    vpcId: string,
    routeTable: { id: string | null; configured: boolean },
    internetGateway: { id: string | null; configured: boolean }
  ): Promise<{
    vpcId: string;
    routeTableId: string;
    internetGatewayId: string;
  }> {
    let igId: string = internetGateway.id ? internetGateway.id : "";
    let rtId: string = routeTable.id ? routeTable.id : "";

    try {
      if (!internetGateway.configured) {
        // Create and attach internet gateway if needed
        console.log("Creating Internet Gateway...");
        const igwCommand = new CreateInternetGatewayCommand({
          TagSpecifications: [
            {
              ResourceType: "internet-gateway",
              Tags: this.getCommonTags(this.getResourceName("igw")),
            },
          ],
        });
        const igwResponse = await this.ec2Client.send(igwCommand);
        const internetGatewayId =
          igwResponse.InternetGateway?.InternetGatewayId;

        if (!internetGatewayId) {
          throw new InfrastructureError(
            "Failed to create Internet Gateway",
            "IGW_ERROR"
          );
        }

        igId = internetGatewayId;

        // Attach internet gateway to VPC
        const attachCommand = new AttachInternetGatewayCommand({
          InternetGatewayId: internetGatewayId,
          VpcId: vpcId,
        });
        await this.ec2Client.send(attachCommand);
      }

      if (!routeTable.configured) {
        // Create route table with internet access
        console.log("Creating Route Table...");
        const rtCommand = new CreateRouteTableCommand({
          VpcId: vpcId,
          TagSpecifications: [
            {
              ResourceType: "route-table",
              Tags: this.getCommonTags(this.getResourceName("rt")),
            },
          ],
        });
        const rtResponse = await this.ec2Client.send(rtCommand);
        const routeTableId = rtResponse.RouteTable?.RouteTableId;

        if (!routeTableId) {
          throw new InfrastructureError(
            "Failed to create Route Table",
            "RT_ERROR"
          );
        }

        rtId = routeTableId;

        // Add route to internet gateway
        console.log("Adding route to Internet Gateway...");
        const routeCommand = new CreateRouteCommand({
          RouteTableId: routeTableId,
          DestinationCidrBlock: "0.0.0.0/0",
          GatewayId: igId,
        });
        await this.ec2Client.send(routeCommand);
      }

      return {
        vpcId,
        routeTableId: rtId,
        internetGatewayId: igId,
      };
    } catch (error) {
      console.error("Error configuring VPC:", error);
      throw new InfrastructureError(
        error instanceof Error ? error.message : "Failed to configure VPC",
        "VPC_ERROR"
      );
    }
  }

  private async getVpcDetails(vpcId: string): Promise<{
    CidrBlock: string;
    AvailabilityZones: string[];
    subnets: string[];
    meta: Vpc;
  }> {
    try {
      const subnetCommand = new DescribeSubnetsCommand({
        Filters: [
          {
            Name: "vpc-id",
            Values: [vpcId],
          },
        ],
      });
      const subnetResponse = await this.ec2Client.send(subnetCommand);

      const subnets = subnetResponse.Subnets?.map(
        (subnet) => subnet?.SubnetId || ""
      );

      const command = new DescribeVpcsCommand({
        VpcIds: [vpcId],
      });

      const response = await this.ec2Client.send(command);
      const vpc = response.Vpcs?.[0];

      if (!vpc || !vpc.CidrBlock) {
        throw new InfrastructureError(
          "Failed to get VPC details: VPC not found or invalid",
          "VPC_DETAILS_ERROR"
        );
      }

      // Get availability zones in the region
      const azCommand = new DescribeAvailabilityZonesCommand({});
      const azResponse = await this.ec2Client.send(azCommand);
      const availabilityZones =
        azResponse.AvailabilityZones?.map((az) => az.ZoneName!) || [];

      if (availabilityZones.length === 0) {
        throw new InfrastructureError(
          "No availability zones found in the region",
          "AZ_ERROR"
        );
      }

      return {
        CidrBlock: vpc.CidrBlock,
        AvailabilityZones: availabilityZones,
        subnets: subnets ? subnets : [],
        meta: vpc,
      };
    } catch (error) {
      console.error("Error getting VPC details:", error);
      throw new InfrastructureError(
        error instanceof Error ? error.message : "Failed to get VPC details",
        "VPC_DETAILS_ERROR"
      );
    }
  }
}

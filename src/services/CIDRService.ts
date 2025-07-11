import { EC2Client, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";

export class CIDRService {
  private readonly ec2Client: EC2Client;
  private readonly vpcCidr: string = "172.31.0.0/16"; // Default VPC CIDR

  constructor(ec2Client: EC2Client) {
    this.ec2Client = ec2Client;
  }

  async getNextAvailableCidr(vpcId: string): Promise<string> {
    // Get existing subnets
    const command = new DescribeSubnetsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    });

    const response = await this.ec2Client.send(command);
    const existingCidrs =
      response.Subnets?.map((subnet) => subnet.CidrBlock) || [];

    // Generate potential CIDR blocks
    for (let i = 0; i < 256; i++) {
      const candidateCidr = `172.31.${i}.0/24`;
      if (!this.checkCidrConflict(candidateCidr, existingCidrs as string[])) {
        return candidateCidr;
      }
    }

    throw new Error("No available CIDR ranges found in VPC");
  }

  private checkCidrConflict(candidate: string, existing: string[]): boolean {
    return existing.some((cidr) => this.doCidrsOverlap(candidate, cidr));
  }

  private doCidrsOverlap(cidr1: string, cidr2: string): boolean {
    const [ip1, prefix1] = cidr1.split("/");
    const [ip2, prefix2] = cidr2.split("/");

    const start1 = this.ipToLong(ip1);
    const start2 = this.ipToLong(ip2);

    const mask1 = -1 << (32 - parseInt(prefix1));
    const mask2 = -1 << (32 - parseInt(prefix2));

    const network1 = start1 & mask1;
    const network2 = start2 & mask2;

    return network1 === network2;
  }

  private ipToLong(ip: string): number {
    return (
      ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>>
      0
    );
  }
}

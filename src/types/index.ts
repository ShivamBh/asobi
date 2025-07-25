export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export type AppAnswers = {
  appName: string;
  instanceType: string;
  numInstances: string;
  region: string;
  type: "empty" | "load-balanced-web-service";
  port?: string;
  runCommand?: string;
};

export type CredentialAnswers = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export type Application = {
  name: string;
  createdAt: string;
  resources: any;
};

export type InfrastructureConfig = {
  appName: string;
  region?: string;
  instanceType?: string;
  amiId?: string;
  keyName?: string;
  type: "background-service" | "load-balanced-web-service";
  port?: number;
  resources: InfrastructureResources;
  accessKeyId: string;
  secretAccessKey: string;
  runCommand?: string;
  codebasePath?: string;
  isNodeProject?: boolean;
  domain?: string;
};

export type InfrastructureResources = {
  vpcId: string | null;
  subnetIds: string[];
  securityGroupIds: string[];
  instanceId: string | null;
  loadBalancerArn: string | null;
  targetGroupArn: string | null;
  certificateArn: string | null;
  routeTableId: string | null;
  internetGatewayId: string | null;
  instanceProfileName: string | null;
};

export type CreateInfrastructureResponse = {
  success: boolean;
  resources?: InfrastructureResources;
  error?: string;
};

export type DeleteInfrastructureResponse = {
  success: boolean;
  error?: string;
};

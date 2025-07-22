import { InfrastructureConfig } from "../types";

export const generateConfigTemplate = (): InfrastructureConfig => ({
  accessKeyId: "",
  appName: "",
  secretAccessKey: "",
  amiId: "",
  codebasePath: "",
  domain: "",
  instanceType: "",
  isNodeProject: false,
  keyName: "",
  port: 8080,
  region: "",
  resources: {
    instanceId: null,
    certificateArn: null,
    instanceProfileName: null,
    internetGatewayId: null,
    loadBalancerArn: null,
    routeTableId: null,
    securityGroupIds: [],
    subnetIds: [],
    targetGroupArn: null,
    vpcId: null,
  },
  runCommand: "",
  type: "load-balanced-web-service",
});

// export const updateConfigFile = (updates: Partial<InfrastructureConfig>): InfrastructureConfig => ({

// })

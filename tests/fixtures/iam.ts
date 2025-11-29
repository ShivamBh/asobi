export const getInstanceProfile = (name: string = "test-profile") => ({
  Arn: "arn:aws:iam::123456789012:instance-profile/test-profile",
  InstanceProfileName: name,
  CreateDate: new Date(),
  InstanceProfileId: "instance-profile-id",
  Path: "/",
  Roles: [],
});

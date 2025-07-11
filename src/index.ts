// // Create and teardown demo



// async function main() { 

//   const config = {
//     appName: "demo-infra",
//     instanceType: "t2.micro",
//     region: "ap-south-1",
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
//   }

//   try {
//     // Create the demo infrastructure
//     console.log("Creating demo infrastructure...");

//     const createResult = await createInfrastructure(config);

//     if (!createResult.success) {
//       console.error("Failed to create infrastructure:", createResult.error);
//       return;
//     }
//     console.log("Demo infrastructure created successfully:", createResult.resources);

//     // Teardown the demo infrastructure
//     console.log("Tearing down demo infrastructure...");
//     const teardownResult = await deleteInfrastructure(config);

//     if (!deleteResult.success) {
//       console.error("Failed to delete infrastructure:", deleteResult.error);
//       return;
//     }
//     console.log("Demo infrastructure torn down successfully.");
//   } catch (error) {
//     console.error("An error occurred:", error);
//   }
// }

// main().catch((error) => {
//   console.error("An unexpected error occurred:", error);
//   process.exit(1);
// }
// );
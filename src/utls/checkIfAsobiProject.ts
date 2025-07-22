import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { generateConfigTemplate } from "./generateConfigTemplate";

export const checkIfAsobiProject = async () => {
  const currentDir = process.cwd();
  const configFilePath = currentDir + "/.asobi/asobi.json";
  try {
    // Check if .asobi exists otherwise create and add the asobi.json file to it.
    const asobiExists = existsSync(currentDir + "/.asobi");
    if (!asobiExists) {
      await mkdir(`${currentDir}/.asobi`);
      const starterConfig = generateConfigTemplate();
      await writeFile(configFilePath, JSON.stringify(starterConfig));
      console.log("Created project config file at", configFilePath);
      return;
    }
    console.log("Found existing config file at", configFilePath);
  } catch (e) {
    console.error(`Failed while checking asobi project`, e);
    process.exit(1);
  }
};

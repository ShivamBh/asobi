import { main } from "./cli/index";

if (require.main === module) {
  main(process.argv.slice(2));
}

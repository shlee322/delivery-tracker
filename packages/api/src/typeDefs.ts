import { readFileSync } from "fs";
import path from "path";

const typeDefs = readFileSync(
  path.resolve(__dirname, "./schema/schema.graphql"),
  "utf8"
);

export { typeDefs };

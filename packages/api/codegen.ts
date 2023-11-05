import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/schema/schema.graphql",
  generates: {
    "src/schema/generated/resolvers-types.ts": {
      config: {
        useIndexSignature: true,
        scalars: {
          DateTime: "string",
          CarrierSpecificData: "Map<string, any>",
        },
      },
      plugins: ["typescript", "typescript-resolvers"],
    },
  },
};
export default config;

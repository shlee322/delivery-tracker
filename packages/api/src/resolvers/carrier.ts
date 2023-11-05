import { GraphQLError } from "graphql/error";
import { type GraphQLResolveInfo } from "graphql/type";
import { type AppContext } from "../AppContext";
import * as schema from "../schema/generated/resolvers-types";
import { ArrayCursorConnection } from "../cursor/ArrayCursorConnection";
import { type Carrier } from "@delivery-tracker/core";

async function queryCarrierResolver(
  parent: undefined,
  args: schema.QueryCarrierArgs,
  contextValue: { appContext: AppContext },
  info: GraphQLResolveInfo
): Promise<Carrier | null> {
  const carrier = contextValue.appContext.carrierRegistry.get(args.id);
  if (carrier == null) {
    throw new GraphQLError("Carrier not found", {
      extensions: {
        code: schema.ErrorCode.NotFound,
      },
    });
  }

  return carrier;
}

async function queryCarriersResolver(
  parent: undefined,
  args: schema.QueryCarriersArgs,
  contextValue: { appContext: AppContext },
  info: GraphQLResolveInfo
): Promise<ArrayCursorConnection<Carrier>> {
  return new ArrayCursorConnection(
    contextValue.appContext.carrierRegistry.carriers,
    20,
    args.first ?? null,
    args.after ?? null,
    args.last ?? null,
    args.before ?? null
  );
}

function carrierIdResolver(
  parent: Carrier,
  args: undefined,
  contextValue: { appContext: AppContext },
  info: GraphQLResolveInfo
): string {
  return parent.carrierId;
}

const QueryResolvers = {
  carrier: queryCarrierResolver,
  carriers: queryCarriersResolver,
};

const CarrierResolvers = {
  id: carrierIdResolver,
};

export { QueryResolvers, CarrierResolvers };

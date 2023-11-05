#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import * as graphql from "graphql";
import {
  DefaultCarrierRegistry,
  logger as coreLogger,
} from "@delivery-tracker/core";
import { typeDefs, resolvers, type AppContext } from "@delivery-tracker/api";
import { initLogger } from "./logger";
import { type Maybe } from "graphql/jsutils/Maybe";
import { type ExecutionResult } from "graphql/execution/execute";

const cliLogger = coreLogger.rootLogger.child({ module: "cli" });

interface TrackArguments {
  carrierId: string;
  trackingNumber: string;
}

async function executeGraphQL(
  source: string,
  variableValues?: Maybe<Readonly<Record<string, unknown>>>
): Promise<ExecutionResult> {
  const schema = graphql.buildSchema(typeDefs);
  const carrierRegistry = new DefaultCarrierRegistry();
  await carrierRegistry.init();
  const appContext: AppContext = {
    carrierRegistry,
  };
  return await graphql.graphql({
    schema,
    source,
    rootValue: resolvers.resolvers.Query,
    contextValue: {
      appContext,
    },
    variableValues,
  });
}

initLogger();

// TODO : 개발중인 기능으로 수정 필요
yargs(hideBin(process.argv))
  .usage("$0 <cmd> [args]")
  .command<TrackArguments>(
    "track <carrier-id> <tracking-number>",
    "Track a shipping",
    (args) => {
      return args
        .positional("carrier-id", {
          describe: "Carrier ID",
        })
        .positional("tracking-number", {
          describe: "Tracking Number",
        });
    },
    async (args) => {
      const result = await executeGraphQL(
        `
        query Track($carrierId: ID!, $trackingNumber: String!) {
          track(carrierId: $carrierId, trackingNumber: $trackingNumber) {
            trackingNumber
            lastEvent {
              status {
                code
                name
              }
              time
              location {
                countryCode
                postalCode
                name
              }
              contact {
                name
                phoneNumber
              }
              description
            }
            events(last: 20) {
              edges {
                node {
                  status {
                    code
                    name
                  }
                  time
                  location {
                    countryCode
                    postalCode
                    name
                  }
                  contact {
                    name
                    phoneNumber
                  }
                  description
                }
              }
            }
            sender {
              name
              phoneNumber
            }
            recipient {
              name
              phoneNumber
            }
          }
        }
      `,
        {
          carrierId: args.carrierId.toString(),
          trackingNumber: args.trackingNumber.toString(),
        }
      );
      cliLogger.info("result", { result });
    }
  )
  .command(
    "carriers",
    "Show Supported Carriers",
    (args) => {},
    async (args) => {
      const result = await executeGraphQL(
        `
        query Carriers {
          carriers(first: 20) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
        {}
      );
      cliLogger.info("result", { result });
    }
  )
  .help()
  .demandCommand(1)
  .parse();

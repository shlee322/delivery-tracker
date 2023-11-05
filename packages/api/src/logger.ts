import type * as winston from "winston";
import { logger as coreLogger } from "@delivery-tracker/core";

const apiRootLogger: winston.Logger = coreLogger.rootLogger.child({
  module: "api",
});

export { apiRootLogger };

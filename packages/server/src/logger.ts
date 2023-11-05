import * as winston from "winston";
import { logger as coreLogger } from "@delivery-tracker/core";
import { DateTime } from "luxon";

function initLogger(): void {
  coreLogger.rootLogger.format = winston.format.combine(
    winston.format.json({
      replacer: (key, value) => {
        // luxon
        if (value instanceof DateTime) {
          return value.toISO();
        }

        // libphonenumber-js / PhoneNumber
        if (
          typeof value === "object" &&
          value !== null &&
          "number" in value &&
          typeof value.number === "string"
        ) {
          return value.number;
        }
        return value;
      },
    })
  );

  if (process.env.LOG_LEVEL) {
    coreLogger.rootLogger.level = process.env.LOG_LEVEL;
  }

  // TODO : file mode
  coreLogger.rootLogger.add(new winston.transports.Console());
}

export { initLogger };

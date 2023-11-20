import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import {
  type TNTTrackingResponse,
  TNTTrackingResponseSchema,
  type TNTTrackingResponseTrackerOutputConsignmentEvent,
} from "./TNTAPIAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "nl.tnt",
});

class TNT extends Carrier {
  readonly carrierId = "nl.tnt";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new TNTTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class TNTTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      con: this.trackingNumber,
      locale: "en_GB",
      searchType: "CON",
      channel: "OPENTRACK",
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://www.tnt.com/api/v3/shipment?${queryString}`
    );

    const traceResponseJson: TNTTrackingResponse = await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await TNTTrackingResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );

    if (!safeParseResult.success) {
      this.logger.warn("traceResponseJson parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    if (traceResponseJson["tracker.output"]?.notFound !== undefined) {
      throw new NotFoundError();
    }

    const defaultConsignment =
      traceResponseJson["tracker.output"].consignment?.at(0);
    if (defaultConsignment === undefined) {
      throw new InternalError();
    }

    const events: TrackEvent[] = [];
    for (const event of defaultConsignment.events) {
      events.unshift(this.transformEvent(event));
    }

    return {
      events,
      sender: {
        name: null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      recipient: {
        name: null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(
    event: TNTTrackingResponseTrackerOutputConsignmentEvent
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(event.statusDescription),
        name: event.statusDescription,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.date),
      location: {
        name: event.location.city,
        countryCode: event.location.countryCode,
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: event.statusDescription,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string): TrackEventStatusCode {
    switch (status) {
      case "Shipment collected from collection address":
        return TrackEventStatusCode.AtPickup;
      case "Shipment arrived at connection point":
        return TrackEventStatusCode.InTransit;
      case "Shipment in transit":
        return TrackEventStatusCode.InTransit;
      case "Shipment now at the depot nearest to collection address":
        return TrackEventStatusCode.InTransit;
      case "Shipment now at depot nearest to delivery address":
        return TrackEventStatusCode.InTransit;
      case "Shipment arrived at TNT location":
        return TrackEventStatusCode.InTransit;
      case "Shipment left in agreed location as instructed":
        return TrackEventStatusCode.Delivered;
      case "Shipment delivered in good condition":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromISO(time, { setZone: true });

    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }
}

export { TNT };

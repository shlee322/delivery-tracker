import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  type TrackEventStatus,
  TrackEventStatusCode,
  type Location,
  type ContactInfo,
  type CarrierInitInput,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { schemas as DHLAPISchemas } from "./DHLAPISchemas";
import { type z } from "zod";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "de.dhl",
});

// TODO : zod로 처리
interface DHLConfig {
  endpoint: string | null;
  apiKey: string;
  transformTimestamp?: (
    input: TransformTimestampInput
  ) => Promise<DateTime | null> | null;
}

interface TransformTimestampInput {
  event: z.infer<
    typeof DHLAPISchemas.supermodelIoLogisticsTrackingShipmentEvent
  >;
}

class DHL extends Carrier {
  readonly carrierId = "de.dhl";
  private config: DHLConfig | null = null;

  public async init(
    input: CarrierInitInput & { config: DHLConfig }
  ): Promise<void> {
    await super.init(input);
    this.config = input.config;
  }

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    if (this.config == null) {
      throw new Error("DHL is not initialized");
    }

    return await new DHLTrackScraper(
      this.config,
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class DHLTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly config: DHLConfig,
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  private get endpoint(): string {
    if (this.config.endpoint == null) {
      return "https://api-eu.dhl.com";
    }
    return this.config.endpoint;
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      trackingNumber: this.trackingNumber,
      language: "en",
      offset: "0",
      limit: "1",
    }).toString();

    // https://developer.dhl/api-reference/shipment-tracking
    const traceResponse = await this.upstreamFetcher.fetch(
      `${this.endpoint}/track/shipments?${queryString}`,
      {
        headers: [
          ["accept", "application/json"],
          ["DHL-API-Key", this.config.apiKey],
        ],
      }
    );
    const traceResponseJson: z.infer<
      typeof DHLAPISchemas.supermodelIoLogisticsTrackingShipments
    > = await traceResponse.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    if (traceResponse.status === 404) {
      throw new NotFoundError();
    }

    if (traceResponse.status !== 200) {
      throw new InternalError();
    }

    const safeParseResult =
      await DHLAPISchemas.supermodelIoLogisticsTrackingShipments
        .strict()
        .safeParseAsync(traceResponseJson);

    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    const shipment = traceResponseJson.shipments?.at(0);
    if (shipment === null) {
      throw new InternalError();
    }

    const eventPromises =
      shipment?.events?.map(
        async (event) => await this.transformEvent(event)
      ) ?? [];
    return {
      events: [...(await Promise.all(eventPromises))].reverse(),
      sender: this.transformContact(
        shipment?.details?.sender ?? null,
        shipment?.origin ?? null
      ),
      recipient: this.transformContact(
        shipment?.details?.receiver ?? null,
        shipment?.destination ?? null
      ),
      carrierSpecificData: new Map(),
    };
  }

  private async transformEvent(
    event: z.infer<
      typeof DHLAPISchemas.supermodelIoLogisticsTrackingShipmentEvent
    >
  ): Promise<TrackEvent> {
    const transformTimestamp =
      this.config.transformTimestamp ?? this.defaultTransformTimestamp();

    let status: TrackEventStatus;
    if (event.status === undefined) {
      status = this.transformDescriptionToStatus(event.description ?? null);
    } else {
      status = {
        code: this.transformStatusCode(event.statusCode ?? null),
        name: event.status ?? null,
        carrierSpecificData: new Map(),
      };
    }

    return {
      status,
      time: await transformTimestamp({
        event,
      }),
      location: this.transformLocation(event.location ?? null),
      contact: null,
      description: event.description ?? event.status ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private defaultTransformTimestamp(): (
    input: TransformTimestampInput
  ) => Promise<DateTime | null> {
    return async (input: TransformTimestampInput) => {
      const timestamp = (input.event.timestamp as string | null) ?? null;
      if (timestamp === null) {
        return null;
      }
      const result = DateTime.fromISO(timestamp, { setZone: true });
      if (!result.isValid) {
        this.logger.warn("time parse error", {
          inputTime: timestamp,
          invalidReason: result.invalidReason,
        });
      }
      return result;
    };
  }

  private transformDescriptionToStatus(
    description: string | null
  ): TrackEventStatus {
    if (description === null) {
      this.logger.warn("transformDescriptionToStatus Unknown (null)", {
        description,
      });
      return {
        code: TrackEventStatusCode.Unknown,
        name: description,
        carrierSpecificData: new Map(),
      };
    }

    if (description === "Shipment picked up") {
      return {
        code: TrackEventStatusCode.AtPickup,
        name: "Shipment picked up",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Processed at ")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Processed",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Shipment has departed from a DHL facility")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Shipment has departed from a DHL facility",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Shipment is in transit to destination")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Shipment is in transit to destination",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Arrived at DHL Sort Facility")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Arrived at DHL Sort Facility",
        carrierSpecificData: new Map(),
      };
    }

    if (description === "Shipment is on hold") {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Shipment is on hold",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Customs clearance status updated.")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Customs clearance status updated",
        carrierSpecificData: new Map(),
      };
    }

    if (description === "Clearance Event") {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Clearance Event",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Processed for clearance at ")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Processed for clearance",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Clearance processing complete at ")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Clearance processing complete",
        carrierSpecificData: new Map(),
      };
    }

    if (description.startsWith("Arrived at DHL Delivery Facility")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "Arrived at DHL Delivery Facility",
        carrierSpecificData: new Map(),
      };
    }

    if (description === "Shipment is out with courier for delivery") {
      return {
        code: TrackEventStatusCode.OutForDelivery,
        name: "Out for delivery",
        carrierSpecificData: new Map(),
      };
    }

    if (description === "Delivered") {
      return {
        code: TrackEventStatusCode.Delivered,
        name: "Delivered",
        carrierSpecificData: new Map(),
      };
    }

    this.logger.warn("transformDescriptionToStatus Unknown", {
      description,
    });
    return {
      code: TrackEventStatusCode.Unknown,
      name: description,
      carrierSpecificData: new Map(),
    };
  }

  private transformStatusCode(statusCode: string | null): TrackEventStatusCode {
    switch (statusCode) {
      case "pre-transit":
        return TrackEventStatusCode.InformationReceived;
      case "transit":
        return TrackEventStatusCode.InTransit;
      case "delivered":
        return TrackEventStatusCode.Delivered;
      case "failure":
        return TrackEventStatusCode.Exception;
      case "unknown":
        return TrackEventStatusCode.Unknown;
    }

    this.logger.warn("parseStatusCode Unknown", {
      statusCode,
    });
    return TrackEventStatusCode.Unknown;
  }

  private transformLocation(
    location: z.infer<
      typeof DHLAPISchemas.supermodelIoLogisticsSupportingPlace
    > | null
  ): Location | null {
    if (location === null) {
      return null;
    }
    return {
      countryCode: location.address?.countryCode ?? null,
      postalCode: location.address?.postalCode ?? null,
      name: location.address?.addressLocality ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private transformContact(
    contact:
      | (z.infer<
          typeof DHLAPISchemas.supermodelIoLogisticsSupportingOrganization
        > &
          z.infer<typeof DHLAPISchemas.supermodelIoLogisticsSupportingPerson>)
      | null,
    location: z.infer<
      typeof DHLAPISchemas.supermodelIoLogisticsSupportingPlace
    > | null
  ): ContactInfo | null {
    if (contact === null) {
      return null;
    }

    let name = contact.name ?? "";

    if (contact.organizationName !== undefined) {
      if (name === "") {
        name = contact.organizationName;
      } else {
        name = `${contact.organizationName} - ${name}`;
      }
    }

    return {
      name,
      location: this.transformLocation(location),
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };
  }
}

export { DHL };

import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type Location,
  type CarrierInitInput,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { type z } from "zod";
import { DateTime } from "luxon";
import {
  CarrierUpstreamFetcher,
  type CarrierUpstreamFetcherInitInput,
} from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "us.fedex",
});

// TODO : zod로 처리
interface FedexConfig {
  endpoint: string | null;
  clientId: string;
  clientSecret: string;
}

class FedexUpstreamFetcher extends CarrierUpstreamFetcher {
  private readonly originUpstreamFetcher: CarrierUpstreamFetcher;
  private readonly config: FedexConfig;
  private accessToken: string | null = null;

  constructor(
    input: CarrierUpstreamFetcherInitInput & {
      originUpstreamFetcher: CarrierUpstreamFetcher;
      config: FedexConfig;
    }
  ) {
    super(input);
    this.originUpstreamFetcher = input.originUpstreamFetcher;
    this.config = input.config;
  }

  get endpoint(): string {
    if (this.config.endpoint == null) {
      return "https://apis.fedex.com";
    }
    return this.config.endpoint;
  }

  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    isRetry?: boolean
  ): Promise<Response> {
    if (this.accessToken === null) {
      carrierLogger.info("fetch Fedex access token");
      const authResponse = await this.originUpstreamFetcher.fetch(
        `${this.endpoint}/oauth/token`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
          }).toString(),
        }
      );
      if (authResponse.status !== 200) {
        carrierLogger.error("auth response status error", {
          status: authResponse.status,
        });
        throw new InternalError();
      }
      const authResponseBody = await authResponse.json();
      this.accessToken = authResponseBody.access_token as string;
      carrierLogger.debug("accesstoken", {
        accessToken: this.accessToken,
      });
    }

    if (init === null || init === undefined) {
      init = {};
    }

    if (init.headers === null || init.headers === undefined) {
      init.headers = {};
    }
    // @ts-expect-error
    init.headers.authorization = `Bearer ${this.accessToken}`;

    const response = await this.originUpstreamFetcher.fetch(input, init);
    if (response.status === 401) {
      if (this.accessToken === null) {
        return response;
      }
      this.accessToken = null;

      if (isRetry === true) {
        return response;
      }
      return await this.fetch(input, init, true);
    }
    return response;
  }
}

class Fedex extends Carrier {
  readonly carrierId = "us.fedex";
  private config: FedexConfig | null = null;
  private fedexUpstreamFetcher: FedexUpstreamFetcher | null = null;

  public async init(
    input: CarrierInitInput & { config: FedexConfig }
  ): Promise<void> {
    await super.init(input);
    this.config = input.config;
    this.fedexUpstreamFetcher = new FedexUpstreamFetcher({
      carrier: this,
      originUpstreamFetcher: this.upstreamFetcher,
      config: this.config,
    });
  }

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    if (this.config == null || this.fedexUpstreamFetcher == null) {
      throw new Error("Fedex is not initialized");
    }

    return await new FedexTrackScraper(
      this.config,
      this.fedexUpstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class FedexTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly config: FedexConfig,
    readonly upstreamFetcher: FedexUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const requestBody = {
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber: this.trackingNumber,
          },
        },
      ],
    };

    // https://developer.fedex.com/api/ko-kr/catalog/track/v1/docs.html
    const traceResponse = await this.upstreamFetcher.fetch(
      `${this.upstreamFetcher.endpoint}/track/v1/trackingnumbers`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const traceResponseJson = await traceResponse.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    if (traceResponse.status !== 200) {
      throw new InternalError();
    }

    const shipment = traceResponseJson.output?.completeTrackResults
      ?.at(0)
      ?.trackResults?.at(0);

    if (shipment === null) {
      throw new InternalError();
    }

    if (shipment.error !== undefined && shipment.error !== null) {
      if (shipment.error.code === "TRACKING.TRACKINGNUMBER.NOTFOUND") {
        throw new NotFoundError(shipment.error.message ?? undefined);
      } else {
        throw new InternalError(shipment.error.message ?? undefined);
      }
    }

    const events: TrackEvent[] = [];
    for (const event of shipment?.scanEvents ?? []) {
      events.unshift(this.transformEvent(event));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(event: any): TrackEvent {
    return {
      status: {
        code: this.transformStatusCode(event.derivedStatusCode ?? null),
        name: event.derivedStatus ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.date ?? null),
      location: this.parseLocation(event.scanLocation ?? null),
      contact: null,
      description: event.eventDescription ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private transformStatusCode(
    derivedStatusCode: string | null
  ): TrackEventStatusCode {
    if (derivedStatusCode === null) {
      this.logger.warn("status null");
      return TrackEventStatusCode.Unknown;
    }

    switch (derivedStatusCode) {
      // Movement
      case "AA": // At Airport
        return TrackEventStatusCode.InTransit;
      case "AC": // At Canada Post facility
        return TrackEventStatusCode.InTransit;
      case "AD": // At Delivery
        return TrackEventStatusCode.InTransit;
      case "AF": // At FedEx Facility
        return TrackEventStatusCode.InTransit;
      case "AO": // Shipment arriving On-time
        return TrackEventStatusCode.InTransit;
      case "AP": // At Pickup
        return TrackEventStatusCode.AtPickup;
      case "AR": // Arrived
        return TrackEventStatusCode.InTransit;
      case "AX": // At USPS facility
        return TrackEventStatusCode.InTransit;
      case "CA": // Shipment Cancelled
        return TrackEventStatusCode.Exception;
      case "CH": // Location Changed
        return TrackEventStatusCode.InTransit;
      case "DD": // Delivery Delay
        return TrackEventStatusCode.InTransit;
      case "DE": // Delivery Exception
        return TrackEventStatusCode.Exception;
      case "DL": // Delivered
        return TrackEventStatusCode.Delivered;
      case "DP": // Departed
        return TrackEventStatusCode.InTransit;
      case "DR": // Vehicle furnished but not used
        return TrackEventStatusCode.InTransit;
      case "DS": // Vehicle Dispatched
        return TrackEventStatusCode.InTransit;
      case "DY": // Delay
        return TrackEventStatusCode.InTransit;
      case "EA": // Enroute to Airport
        return TrackEventStatusCode.InTransit;
      case "ED": // Enroute to Delivery
        return TrackEventStatusCode.InTransit;
      case "EO": // Enroute to Origin Airport
        return TrackEventStatusCode.InTransit;
      case "EP": // Enroute to Pickup
        return TrackEventStatusCode.InTransit;
      case "FD": // At FedEx Destination
        return TrackEventStatusCode.InTransit;
      case "HL": // Hold at Location
        return TrackEventStatusCode.InTransit;
      case "IN": // Initiated
        return TrackEventStatusCode.InformationReceived;
      case "IT": // In Transit
        return TrackEventStatusCode.InTransit;
      case "IX": // In transit (see Details)
        return TrackEventStatusCode.InTransit;
      case "LO": // Left Origin
        return TrackEventStatusCode.InTransit;
      case "OC": // Order Created
        return TrackEventStatusCode.InformationReceived;
      case "OD": // Out for Delivery
        return TrackEventStatusCode.OutForDelivery;
      case "OF": // At FedEx origin facility
        return TrackEventStatusCode.InTransit;
      case "OX": // Shipment information sent to USPS
        return TrackEventStatusCode.InTransit;
      case "PD": // Pickup Delay
        return TrackEventStatusCode.InTransit;
      case "PF": // Plane in Flight
        return TrackEventStatusCode.InTransit;
      case "PL": // Plane Landed
        return TrackEventStatusCode.InTransit;
      case "PM": // In Progress
        return TrackEventStatusCode.InTransit;
      case "PU": // Picked Up
        return TrackEventStatusCode.AtPickup;
      case "PX": // Picked up (see Details)
        return TrackEventStatusCode.AtPickup;
      case "RR": // CDO requested
        return TrackEventStatusCode.InTransit;
      case "RM": // CDO Modified
        return TrackEventStatusCode.InTransit;
      case "RC": // CDO Cancelled
        return TrackEventStatusCode.InTransit;
      case "RS": // Return to Shipper
        return TrackEventStatusCode.InTransit;
      case "RP": // Return label link emailed to return sender
        return TrackEventStatusCode.InTransit;
      case "LP": // Return label link cancelled by shipment originator
        return TrackEventStatusCode.InTransit;
      case "RG": // Return label link expiring soon
        return TrackEventStatusCode.InTransit;
      case "RD": // Return label link expired
        return TrackEventStatusCode.InTransit;
      case "SE": // Shipment Exception
        return TrackEventStatusCode.InTransit;
      case "SF": // At Sort Facility
        return TrackEventStatusCode.InTransit;
      case "SP": // Split Status
        return TrackEventStatusCode.InTransit;
      case "TR": // Transfer
        return TrackEventStatusCode.InTransit;
    }

    this.logger.warn("Unexpected status code", {
      derivedStatusCode,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      this.logger.warn("date or time null");
      return null;
    }

    const result = DateTime.fromISO(time, {
      setZone: true,
    });

    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }

  private parseLocation(location: any | null): Location | null {
    if (location === null) {
      this.logger.warn("location null");
      return null;
    }

    return {
      name: location.city ?? null,
      countryCode: location.countryCode ?? null,
      postalCode: location.postalCode ?? null,
      carrierSpecificData: new Map(),
    };
  }
}

export { Fedex };

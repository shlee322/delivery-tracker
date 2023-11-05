import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackEventStatus,
  type CarrierInitInput,
} from "../../core";
import { rootLogger } from "../../logger";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { type z } from "zod";
import { DateTime } from "luxon";
import {
  type CarrierUpstreamFetcherInitInput,
  CarrierUpstreamFetcher,
} from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { schemas as USPSAPISchemas } from "./USPSAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "us.usps",
});

// TODO : zod로 처리
interface USPSConfig {
  clientId: string;
  clientSecret: string;
}

class USPSUpstreamFetcher extends CarrierUpstreamFetcher {
  private readonly originUpstreamFetcher: CarrierUpstreamFetcher;
  private readonly config: USPSConfig;
  private accessToken: string | null = null;

  constructor(
    input: CarrierUpstreamFetcherInitInput & {
      originUpstreamFetcher: CarrierUpstreamFetcher;
      config: USPSConfig;
    }
  ) {
    super(input);
    this.originUpstreamFetcher = input.originUpstreamFetcher;
    this.config = input.config;
  }

  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    isRetry?: boolean
  ): Promise<Response> {
    if (this.accessToken === null) {
      carrierLogger.info("fetch USPS access token");
      const authResponse = await this.originUpstreamFetcher.fetch(
        "https://api.usps.com/oauth2/v3/token",
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

class USPS extends Carrier {
  readonly carrierId = "us.usps";
  private config: USPSConfig | null = null;
  private uspsUpstreamFetcher: USPSUpstreamFetcher | null = null;

  public async init(
    input: CarrierInitInput & { config: USPSConfig }
  ): Promise<void> {
    await super.init(input);
    this.config = input.config;
    this.uspsUpstreamFetcher = new USPSUpstreamFetcher({
      carrier: this,
      originUpstreamFetcher: this.upstreamFetcher,
      config: this.config,
    });
  }

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    if (this.config == null) {
      throw new Error("USPS is not initialized");
    }
    if (this.uspsUpstreamFetcher == null) {
      throw new Error("USPS is not initialized");
    }

    return await new USPSTrackScraper(
      this.config,
      this.uspsUpstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class USPSTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly config: USPSConfig,
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const traceResponse = await this.upstreamFetcher.fetch(
      `https://api.usps.com/tracking/v3/tracking/${encodeURIComponent(
        this.trackingNumber
      )}?expand=SUMMARY`
    );

    const traceResponseJson: z.infer<typeof USPSAPISchemas.TrackingSummary> =
      await traceResponse.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
      traceResponseStatus: traceResponse.status,
    });

    if (traceResponse.status === 400) {
      throw new BadRequestError();
    }

    if (traceResponse.status === 404) {
      throw new NotFoundError();
    }

    if (traceResponse.status !== 200) {
      throw new InternalError();
    }

    const safeParseResult =
      await USPSAPISchemas.TrackingSummary.strict().safeParseAsync(
        traceResponseJson
      );

    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    // TODO : DETAIL 의 경우 time 데이터를 제대로 주지 않아 SUMMARY를 파싱

    const events: TrackEvent[] = [];
    for (const eventSummary of traceResponseJson.eventSummaries ?? []) {
      events.unshift(this.transformEvent(eventSummary));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(eventSummary: string): TrackEvent {
    return {
      status: this.transformStatus(eventSummary),
      time: this.transformTime(eventSummary),
      location: null,
      contact: null,
      description: eventSummary,
      carrierSpecificData: new Map(),
    };
  }

  private transformStatus(eventSummary: string): TrackEventStatus {
    const statusList: Array<[string, TrackEventStatusCode]> = [
      ["Shipping Label Created", TrackEventStatusCode.InformationReceived],
      ["USPS in possession of item", TrackEventStatusCode.InTransit],
      ["Departed Post Office", TrackEventStatusCode.InTransit],
      ["Arrived at USPS Regional Origin Facility", TrackEventStatusCode.InTransit],
      ["Departed USPS Regional Facility", TrackEventStatusCode.InTransit],
      ["Arrived at USPS Facility", TrackEventStatusCode.InTransit],
      ["Departed USPS Facility", TrackEventStatusCode.InTransit],
      ["Arrived at USPS Regional Facility", TrackEventStatusCode.InTransit],
      ["In Transit to Next Facility", TrackEventStatusCode.InTransit],
      ["Processed Through USPS Regional Facility", TrackEventStatusCode.InTransit],
      ["Processed Through Facility", TrackEventStatusCode.InTransit],
      ["Processed through Facility", TrackEventStatusCode.InTransit],
      ["Held in Customs", TrackEventStatusCode.InTransit],
      ["Customs Clearance", TrackEventStatusCode.InTransit],
      ["Acceptance", TrackEventStatusCode.InTransit],
      ["Arrival at Post Office", TrackEventStatusCode.InTransit],
      ["Arrived at Post Office", TrackEventStatusCode.InTransit],
      ["Out for Delivery", TrackEventStatusCode.OutForDelivery],
      ["Your item was delivered", TrackEventStatusCode.Delivered],
      ["Arrived", TrackEventStatusCode.InTransit],
      ["Departed", TrackEventStatusCode.InTransit],
    ];

    for (const status of statusList) {
      if (eventSummary.startsWith(status[0])) {
        return {
          code: status[1],
          name: status[0],
          carrierSpecificData: new Map(),
        };
      }
    }

    this.logger.warn("Unexpected status", {
      eventSummary,
    });
    return {
      code: TrackEventStatusCode.Unknown,
      name: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformTime(eventSummary: string): DateTime | null {
    let match = eventSummary.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}) (am|pm)/
    );
    if (match !== null) {
      const result = DateTime.fromObject(
        {
          month: Number(match[1]),
          day: Number(match[2]),
          year: Number(match[3]),
          hour: (Number(match[4]) % 12) + (match[6] === "am" ? 0 : 12),
          minute: Number(match[5]),
        },
        {
          zone: "America/New_York",
        }
      );
      if (!result.isValid) {
        this.logger.warn("time parse error", {
          eventSummary,
          invalidReason: result.invalidReason,
        });
      }
      return result;
    }

    match = eventSummary.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (am|pm)/
    );
    if (match !== null) {
      const result = DateTime.fromObject(
        {
          month: this.monthLongToNumber(match[1]),
          day: Number(match[2]),
          year: Number(match[3]),
          hour: (Number(match[4]) % 12) + (match[6] === "am" ? 0 : 12),
          minute: Number(match[5]),
        },
        {
          zone: "America/New_York",
        }
      );
      if (!result.isValid) {
        this.logger.warn("time parse error", {
          eventSummary,
          invalidReason: result.invalidReason,
        });
      }
      return result;
    }

    match = eventSummary.match(
      /(\d{1,2}):(\d{2}) (am|pm) on (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/
    );
    if (match !== null) {
      const result = DateTime.fromObject(
        {
          hour: (Number(match[1]) % 12) + (match[3] === "am" ? 0 : 12),
          minute: Number(match[2]),
          month: this.monthLongToNumber(match[4]),
          day: Number(match[5]),
          year: Number(match[6]),
        },
        {
          zone: "America/New_York",
        }
      );
      if (!result.isValid) {
        this.logger.warn("time parse error", {
          eventSummary,
          invalidReason: result.invalidReason,
        });
      }
      return result;
    }

    this.logger.warn("not found time", {
      eventSummary,
    });
    return null;
  }

  private monthLongToNumber(monthLong: string): number {
    switch (monthLong) {
      case "January":
        return 1;
      case "February":
        return 2;
      case "March":
        return 3;
      case "April":
        return 4;
      case "May":
        return 5;
      case "June":
        return 6;
      case "July":
        return 7;
      case "August":
        return 8;
      case "September":
        return 9;
      case "October":
        return 10;
      case "November":
        return 11;
      case "December":
        return 12;
    }

    throw new Error("month parse error");
  }
}

export { USPS };

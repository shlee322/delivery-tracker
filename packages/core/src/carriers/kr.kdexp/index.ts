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
  type KyungdongExpressTrackingResponse,
  KyungdongExpressTrackingResponseSchema,
  type KyungdongExpressTrackingResponseItem,
} from "./KyungdongExpressAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.kdexp",
});

class KyungdongExpress extends Carrier {
  readonly carrierId = "kr.kdexp";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new KyungdongExpressTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class KyungdongExpressTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      barcode: this.trackingNumber,
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://kdexp.com/service/delivery/ajax_basic.do?${queryString}`
    );

    const traceResponseJson: KyungdongExpressTrackingResponse =
      await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await KyungdongExpressTrackingResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );

    if (!safeParseResult.success) {
      this.logger.warn("traceResponseJson parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    if (traceResponseJson.result !== "suc") {
      throw new NotFoundError();
    }

    if (
      traceResponseJson.items === null ||
      traceResponseJson.items === undefined
    ) {
      throw new InternalError();
    }

    const events: TrackEvent[] = [];
    for (const event of traceResponseJson.items) {
      events.push(this.parseEvent(event));
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

  private parseEvent(event: KyungdongExpressTrackingResponseItem): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(event.stat),
        name: event.stat,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.reg_date),
      location: {
        name: event.location,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: this.parseDescription(event),
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "접수완료":
        return TrackEventStatusCode.InformationReceived;
      case "영업소집하":
        return TrackEventStatusCode.AtPickup;
      case "터미널입고":
        return TrackEventStatusCode.InTransit;
      case "배달차량상차":
        return TrackEventStatusCode.InTransit;
      case "배송완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseDescription(
    event: KyungdongExpressTrackingResponseItem
  ): string | null {
    return `${event.stat} - ${event.location}`;
  }

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss.u", {
      zone: "Asia/Seoul",
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
}

export { KyungdongExpress };

import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import {
  HonamLogisTrackingInfoResponseSchema,
  type HonamLogisTrackingInfoResponse,
  type HonamLogisTrackingInfoTrackTrackingDetail,
} from "./HonamLogisAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.honamlogis",
});

class HonamLogis extends Carrier {
  readonly carrierId = "kr.honamlogis";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new HonamLogisTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class HonamLogisTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "http://inkoin.com/tracking_number.php",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          SLIP_BARCD: this.trackingNumber,
        }).toString(),
      }
    );

    const traceResponseJson: HonamLogisTrackingInfoResponse =
      await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await HonamLogisTrackingInfoResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );

    if (!safeParseResult.success) {
      this.logger.warn("traceResponseJson parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    if (traceResponseJson.ODS0_TOTAL < 1) {
      throw new NotFoundError();
    }

    const ods = traceResponseJson.ODS0[0];

    const events: TrackEvent[] = [];
    for (const event of ods.TRACKING_DTL) {
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

  private parseEvent(
    event: HonamLogisTrackingInfoTrackTrackingDetail
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(event.SCANGB_NM),
        name: event.SCANGB_NM,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.SCAN_DM),
      location: {
        name: event.SCAN_USER_NM,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: this.parseDescription(event.SCANGB_NM),
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "노선상차":
        return TrackEventStatusCode.InTransit;
      case "집하입고":
        return TrackEventStatusCode.InTransit;
      case "집하상차":
        return TrackEventStatusCode.InTransit;
      case "HUB T/M도착":
        return TrackEventStatusCode.InTransit;
      case "T/M출고":
        return TrackEventStatusCode.InTransit;
      case "터미널출고":
        return TrackEventStatusCode.InTransit;
      case "터미널입고":
        return TrackEventStatusCode.InTransit;
      case "노선하차":
        return TrackEventStatusCode.InTransit;
      case "영업소입고":
        return TrackEventStatusCode.InTransit;
      case "배송출발":
        return TrackEventStatusCode.OutForDelivery;
      case "배송완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseDescription(status: string | null): string | null {
    return status;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      return null;
    }

    const result = DateTime.fromFormat(time, "yyyyMMddHHmmss", {
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

export { HonamLogis };

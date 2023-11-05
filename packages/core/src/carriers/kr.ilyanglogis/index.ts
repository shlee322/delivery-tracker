import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import {
  type IlyangLogisTrackingInfoResponse,
  IlyangLogisTrackingInfoResponseSchema,
  type IlyangLogisTrackingInfoResponseResultAPIBodyResultListTracking,
} from "./IlyangLogisAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.ilyanglogis",
});

class IlyangLogis extends Carrier {
  readonly carrierId = "kr.ilyanglogis";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new IlyangLogisTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class IlyangLogisTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "https://www.ilyanglogis.co.kr/include/getAPIResult.asp",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          req_type: "TRACKING",
          tracking_type: "0",
          blNum: this.trackingNumber,
        }).toString(),
      }
    );

    const traceResponseJson: IlyangLogisTrackingInfoResponse =
      await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await IlyangLogisTrackingInfoResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );

    if (!safeParseResult.success) {
      this.logger.warn("traceResponseJson parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    const result = traceResponseJson.resultAPI.body.resultList.at(0);
    if (result === null || result === undefined) {
      throw new InternalError();
    }

    if (result.tracking === null || result.tracking === undefined) {
      const message =
        typeof result.lastTrackingDesc === "string" &&
        result.lastTrackingDesc !== ""
          ? result.lastTrackingDesc
          : result.resultDesc ?? null;

      if (message.startsWith("미 접수된 물품")) {
        throw new NotFoundError(message);
      }

      throw new BadRequestError(message);
    }

    const events: TrackEvent[] = [];
    for (const event of result.tracking) {
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
    event: IlyangLogisTrackingInfoResponseResultAPIBodyResultListTracking
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(event.chkPointDesc),
        name: event.chkPointDesc,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.actDate, event.actTime),
      location: {
        name: event.stationName,
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
      case "발송사무소 인수":
        return TrackEventStatusCode.AtPickup;
      case "배송경유지 출고":
        return TrackEventStatusCode.InTransit;
      case "배송경유지 도착":
        return TrackEventStatusCode.InTransit;
      case "직원 배송중":
        return TrackEventStatusCode.OutForDelivery;
      case "배달완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseDescription(
    event: IlyangLogisTrackingInfoResponseResultAPIBodyResultListTracking
  ): string | null {
    return `${event.chkPointDesc} - ${event.stationName}`;
  }

  private parseTime(date: string, time: string): DateTime | null {
    const result = DateTime.fromFormat(`${date} ${time}`, "yyyyMMdd HHmm", {
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

export { IlyangLogis };

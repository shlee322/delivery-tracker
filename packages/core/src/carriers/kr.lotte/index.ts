import { type z } from "zod";
import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type Location,
} from "../../core";
import { rootLogger } from "../../logger";
import { BadRequestError, NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import type * as schema from "./LotteGlobalLogisticsAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.lotte",
});

class LotteGlobalLogistics extends Carrier {
  readonly carrierId = "kr.lotte";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new LotteGlobalLogisticsTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class LotteGlobalLogisticsTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    if (this.trackingNumber.length !== 12) {
      throw new BadRequestError();
    }
    if (!/^\d+$/.test(this.trackingNumber)) {
      throw new BadRequestError();
    }

    const checksum = Number(this.trackingNumber.substring(11, 12));
    if (Number(this.trackingNumber.substring(0, 11)) % 7 !== checksum) {
      throw new BadRequestError();
    }

    const queryString = new URLSearchParams({
      invNo: this.trackingNumber,
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://ftr.alps.llogis.com:18260/openapi/ftr/getCustomerInvTracking?${queryString}`
    );

    const trackingResponseJson: z.infer<
      typeof schema.LotteGlobalLogisticsGetCustomerInvTrackingResponseSchema
    > = await response.json();
    this.logger.debug("trackingResponseJson", {
      json: trackingResponseJson,
    });

    if (
      trackingResponseJson.errorCd === "0" &&
      trackingResponseJson.tracking.length === 0
    ) {
      throw new NotFoundError();
    }

    const events: TrackEvent[] = [];
    for (const event of trackingResponseJson.tracking) {
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
    tracking: z.infer<
      typeof schema.LotteGlobalLogisticsGetCustomerInvTrackingResponseTrackingItemSchema
    >
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(tracking.GODS_STAT_CD),
        name: tracking.GODS_STAT_NM ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(tracking.SCAN_YMD, tracking.SCAN_TME),
      location: this.parseLocation(tracking.BRNSHP_NM),
      contact: null,
      description: `${tracking.PTN_BRNSHP_NM} - ${tracking.STATUS}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(statCd: string | null): TrackEventStatusCode {
    switch (statCd) {
      case "09": // 반품취소
        return TrackEventStatusCode.Exception;
      case "10": // 집하
        return TrackEventStatusCode.AtPickup;
      case "12": // 운송장 등록
        return TrackEventStatusCode.InformationReceived;
      case "20": // 구간발송
        return TrackEventStatusCode.InTransit;
      case "21": // 구간도착
        return TrackEventStatusCode.InTransit;
      case "24": // 적입
        return TrackEventStatusCode.InTransit;
      case "25": // 해체
        return TrackEventStatusCode.InTransit;
      case "40": // 배달전
        return TrackEventStatusCode.OutForDelivery;
      case "41": // 배달완료
        return TrackEventStatusCode.Delivered;
      case "45": // 인수자등록
        return TrackEventStatusCode.Unknown;
    }
    this.logger.warn("Unexpected status code", {
      statCd,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(date: string, time: string): DateTime | null {
    if (time === null) {
      this.logger.warn("time null");
      return null;
    }
    if (time === "------") {
      // TODO : 23:59:59 대신 이전 이벤트 기반으로 보정 필요
      time = `235959`;
    }

    const result = DateTime.fromFormat(`${date} ${time}`, "yyyyMMdd HHmmss", {
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

  private parseLocation(location: string | null): Location | null {
    if (location === null) {
      this.logger.warn("location null");
      return null;
    }

    return {
      name: location,
      countryCode: "KR",
      postalCode: null,
      carrierSpecificData: new Map(),
    };
  }
}

export { LotteGlobalLogistics };

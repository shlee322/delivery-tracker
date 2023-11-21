import {
  Carrier,
  type ContactInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackInfo,
  type CarrierTrackInput,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { type Logger } from "winston";
import {
  type CVSnetTrackingInfoResponse,
  type CVSnetTrackingInfoResponseContact,
  CVSnetTrackingInfoResponseSchema,
  type CVSnetTrackingInfoResponseTrackingDetail,
} from "./CVSnetAPISchemas";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.cvsnet",
});

class CVSnet extends Carrier {
  readonly carrierId = "kr.cvsnet";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new CVSnetTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class CVSnetTrackScraper {
  private readonly logger: Logger;
  private readonly carrierSpecificDataPrefix = "kr.cvsnet";

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      invoice_no: this.trackingNumber,
    }).toString();
    const deliveryResponse = await this.upstreamFetcher.fetch(
      `https://www.cvsnet.co.kr/invoice/tracking.do?${queryString}`
    );

    const deliveryResponseHtmlText = await deliveryResponse.text();
    this.logger.debug("deliveryResponseHtmlText", {
      html: deliveryResponseHtmlText,
    });

    const trackingInfoRegex = /var\s+trackingInfo\s*=\s*({[\s\S]*?});\s*\n/;
    const trackingInfoRegexResult =
      deliveryResponseHtmlText.match(trackingInfoRegex);

    if (trackingInfoRegexResult == null) {
      this.logger.error("trackingInfoPattern not found", {
        html: deliveryResponseHtmlText,
      });
      throw new InternalError();
    }

    let trackingInfo: CVSnetTrackingInfoResponse | null = null;
    try {
      trackingInfo = JSON.parse(trackingInfoRegexResult[1]);
    } catch (e) {
      this.logger.error("trackingInfo parsing failed", {
        rawJson: trackingInfoRegexResult[1],
      });
      throw new InternalError();
    }
    this.logger.debug("trackingInfo", {
      data: trackingInfo,
    });

    if (
      typeof trackingInfo?.code === "number" &&
      [100, 400, 404].includes(trackingInfo?.code)
    ) {
      throw new NotFoundError(
        // @ts-expect-error
        trackingInfo?.msg ?? "Not found Tracking Number"
      );
    }

    const safeParseResult =
      await CVSnetTrackingInfoResponseSchema.strict().safeParseAsync(
        trackingInfo
      );

    if (!safeParseResult.success) {
      this.logger.warn("trackingInfo parse failed (strict)", {
        error: safeParseResult.error,
        trackingInfo,
      });
    }

    if (trackingInfo == null) {
      throw new InternalError();
    }

    return {
      sender: this.parseContactInfo(trackingInfo.sender),
      recipient: this.parseContactInfo(trackingInfo.receiver),
      events: trackingInfo.trackingDetails.map((trackingDetail) =>
        this.parseTrackEvent(trackingDetail)
      ),
      carrierSpecificData: new Map<string, any>([
        [
          `${this.carrierSpecificDataPrefix}/raw/carrierName`,
          trackingInfo.carrierName,
        ],
        [
          `${this.carrierSpecificDataPrefix}/raw/carrierType`,
          trackingInfo.carrierType,
        ],
        [`${this.carrierSpecificDataPrefix}/raw/code`, trackingInfo.code],
        [
          `${this.carrierSpecificDataPrefix}/raw/goodsName`,
          trackingInfo.goodsName,
        ],
        [
          `${this.carrierSpecificDataPrefix}/raw/serviceName`,
          trackingInfo.serviceName,
        ],
        [
          `${this.carrierSpecificDataPrefix}/raw/serviceType`,
          trackingInfo.serviceType,
        ],
      ]),
    };
  }

  private parseContactInfo(
    contact: CVSnetTrackingInfoResponseContact
  ): ContactInfo {
    return {
      name: contact.name,
      location: {
        countryCode: "KR",
        postalCode: null,
        name: contact.name,
        carrierSpecificData: new Map([
          [
            `${this.carrierSpecificDataPrefix}/raw/baseAddress`,
            contact.baseAddress,
          ],
          [
            `${this.carrierSpecificDataPrefix}/raw/detailAddress`,
            contact.detailAddress,
          ],
        ]),
      },
      phoneNumber: {
        "@type": "@delivery-tracker/core/MaskedPhoneNumber",
        maskedPhoneNumber: `+82${contact.tel
          .replaceAll("*", "X")
          .replace(/^0+/, "")}`,
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseTrackEvent(
    trackingDetail: CVSnetTrackingInfoResponseTrackingDetail
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(trackingDetail.transCode),
        name: trackingDetail.transKind,
        carrierSpecificData: new Map([
          [
            `${this.carrierSpecificDataPrefix}/raw/transCode`,
            trackingDetail.transCode,
          ],
        ]),
      },
      time: this.parseTime(trackingDetail.transTime),
      location: {
        countryCode: "KR",
        name: trackingDetail.transWhere,
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: `${trackingDetail.transKind} 하였습니다.`,
      carrierSpecificData: new Map([
        [`${this.carrierSpecificDataPrefix}/raw/level`, trackingDetail.level],
      ]),
    };
  }

  private parseStatusCode(transCode: string): TrackEventStatusCode {
    switch (transCode) {
      case "C01": // 점포접수
        return TrackEventStatusCode.InformationReceived;
      case "C015": // 배송기사 인수
        return TrackEventStatusCode.AtPickup;
      case "C02": // 점포 → (집화)일배 입고
      case "C03": // (집화)일배 →  허브 출고
      case "C04": // (집화)일배 →  허브 입고
      case "C07": // 허브 →  (도착)일배 출고
      case "C08": // 허브 →  (도착)일배 입고
      case "C09": // (도착)일배 → 점포 출고
        return TrackEventStatusCode.InTransit;
      case "C095": // 배송기사 인계
        return TrackEventStatusCode.OutForDelivery;
      case "C10": // 점포도착
        return TrackEventStatusCode.AvailableForPickup;
      case "C11": // 고객전달
        return TrackEventStatusCode.Delivered;
      case "11": // 집화처리
        return TrackEventStatusCode.AtPickup;
      case "21": // SM입고
      case "41": // 간선상차
      case "42": // 간선하차
        return TrackEventStatusCode.InTransit;
      case "82": // 배송출발
        return TrackEventStatusCode.OutForDelivery;
      case "91": // 배송완료
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      transCode,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromISO(time, { zone: "Asia/Seoul" });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
    }
    return result;
  }
}

export { CVSnet };

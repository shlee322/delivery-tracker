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

const carrierLogger = rootLogger.child({
  carrierId: "kr.coupangls",
});

class CoupangLogisticsServices extends Carrier {
  readonly carrierId = "kr.coupangls";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new CoupangLogisticsServicesScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class CoupangLogisticsServicesScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const invoiceResponse = await this.upstreamFetcher.fetch(
      `https://www.coupangls.com/web/api/invoice/${encodeURIComponent(
        this.trackingNumber
      )}`
    );

    const invoiceResponseBody = await invoiceResponse.json();
    this.logger.debug("invoiceResponseBody", {
      invoiceResponseBody,
    });

    if (invoiceResponseBody.message !== "SUCCESS") {
      throw new InternalError();
    }

    if (invoiceResponseBody.data === null) {
      throw new NotFoundError(
        "운송장 미등록 상태이거나 업체에서 상품을 준비중입니다."
      );
    }

    const events: TrackEvent[] = [];
    for (const trackedInfo of invoiceResponseBody.data.trackedInfoList) {
      events.push(this.parseEvent(trackedInfo));
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
        name: invoiceResponseBody.data.recipientName ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(trackedInfo: any): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(trackedInfo.trackedStatusName),
        name: trackedInfo.trackedStatusName ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(trackedInfo.trackedDateStr),
      location: null,
      contact: null,
      description: this.parseDescription(trackedInfo),
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "집하":
      case "캠프도착":
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

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss", {
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

  private parseDescription(event: any): string | null {
    try {
      return `${event.trackedStatusName} - ${event.trackedWorkspaceName}`;
    } catch (err) {
      this.logger.error("description parse error", { err });
      return null;
    }
  }
}

export { CoupangLogisticsServices };

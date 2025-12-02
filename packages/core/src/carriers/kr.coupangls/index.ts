import { type Logger } from "winston";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
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
      `https://www.coupangls.com/web/modal/invoice/${encodeURIComponent(
        this.trackingNumber
      )}`
    );
    const invoiceResponseHtmlText = await invoiceResponse.text();
    this.logger.debug("invoiceResponseHtmlText", {
      html: invoiceResponseHtmlText,
    });

    const dom = new JSDOM(invoiceResponseHtmlText);
    const { document } = dom.window;

    const eventTrs = document.querySelectorAll(".tracking-detail > table > tbody > tr");

    if (eventTrs.length === 0) {
      const message = document.querySelector(".modal-body")?.textContent?.replace(/\s+/g, " ")?.trim() ?? null;
      if (message?.includes("운송장 미등록") === true || message?.includes("waybill is not registered") === true) {
        throw new NotFoundError(message);
      } else {
        throw new InternalError(message ?? undefined);
      }
    }

    const events: TrackEvent[] = [];
    for (const eventTr of eventTrs) {
      events.push(this.parseEvent(eventTr));
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
        name: document.querySelector(".recipient > div")?.textContent?.replace(/ 님$/, "") ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(eventTr: Element): TrackEvent {
    const tds = eventTr.querySelectorAll("td");

    const timeText = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const locationText = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const statusText = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(statusText),
        name: statusText,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(timeText),
      location: null,
      contact: null,
      description: `${statusText ?? ""} - ${locationText ?? ""}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "운송장 등록":
        return TrackEventStatusCode.InformationReceived;
      case "공항출발":
      case "항공기 출발":
      case "통관시작":
      case "항공기 도착":
      case "공항도착":
      case "통관완료":
      case "택배접수":
      case "센터상차":
      case "센터도착":
      case "집하":
      case "캠프상차":
      case "소터분류":
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

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      this.logger.warn("time parse error", {
        inputTime: time,
      });
      return null;
    }

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
}

export { CoupangLogisticsServices };

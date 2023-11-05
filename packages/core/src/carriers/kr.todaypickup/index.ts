import { type Logger } from "winston";
import { JSDOM } from "jsdom";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type Location,
  type TrackEventStatus,
} from "../../core";
import { rootLogger } from "../../logger";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.todaypickup",
});

class TodayPickup extends Carrier {
  readonly carrierId = "kr.todaypickup";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new TodayPickupTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class TodayPickupTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      `https://mall.todaypickup.com/front/delivery/list/${encodeURIComponent(
        this.trackingNumber
      )}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const tables = document.querySelectorAll("table");
    if (tables.length !== 3) {
      this.logger.warn("table count error");
    }
    const infoTds = tables[1].querySelectorAll("tbody > tr > td");
    if ((infoTds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? "") === "") {
      const message = infoTds[1].textContent?.replace(/\s+/g, " ")?.trim();

      if (message?.includes("정보가 없") === true) {
        throw new NotFoundError();
      } else {
        throw new BadRequestError();
      }
    }
    const eventTrs = tables[2].querySelectorAll("tbody > tr");

    const events: TrackEvent[] = [];
    for (const event of eventTrs) {
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

  private parseEvent(tr: Element): TrackEvent {
    const tds = tr.querySelectorAll("td");
    const time = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const description =
      tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: this.parseStatus(description),
      time: this.parseTime(time),
      location: this.parseLocation(location),
      contact: null,
      description,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(description: string | null): TrackEventStatus {
    if (description === null) {
      this.logger.error("description null");
      return {
        code: TrackEventStatusCode.Unknown,
        name: null,
        carrierSpecificData: new Map(),
      };
    }

    if (description.includes("접수")) {
      return {
        code: TrackEventStatusCode.InformationReceived,
        name: "상품 접수",
        carrierSpecificData: new Map(),
      };
    }

    if (description.includes("수거")) {
      return {
        code: TrackEventStatusCode.AtPickup,
        name: "상품 수거",
        carrierSpecificData: new Map(),
      };
    }

    if (description.includes("거점에 입고")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "거점 입고",
        carrierSpecificData: new Map(),
      };
    }

    if (description.includes("배송 중")) {
      return {
        code: TrackEventStatusCode.OutForDelivery,
        name: "배송 중",
        carrierSpecificData: new Map(),
      };
    }

    if (description.includes("도착")) {
      return {
        code: TrackEventStatusCode.Delivered,
        name: "배송완료",
        carrierSpecificData: new Map(),
      };
    }

    this.logger.warn("Unexpected status code", {
      description,
    });
    return {
      code: TrackEventStatusCode.Unknown,
      name: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      this.logger.warn("date or time null");
      return null;
    }

    const result = DateTime.fromFormat(time, "yyyy.MM.dd HH:mm", {
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

export { TodayPickup };

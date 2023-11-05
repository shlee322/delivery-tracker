import { type Logger } from "winston";
import { JSDOM } from "jsdom";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type Location,
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
  carrierId: "kr.slx",
});

class SLX extends Carrier {
  readonly carrierId = "kr.slx";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new SLXTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class SLXTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      iv_no: this.trackingNumber,
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://net.slx.co.kr/info/tracking.jsp?${queryString}`
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
    const eventTrs = tables[2].querySelectorAll("tbody > tr:not(:first-child)");
    if (
      eventTrs.length === 1 &&
      eventTrs[0].querySelector("td")?.textContent === ""
    ) {
      throw new NotFoundError();
    }

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
    const status = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const date = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const time = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(date, time),
      location: this.parseLocation(location),
      contact: null,
      description: `${status ?? ""} - ${location ?? ""}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "상품집하":
        return TrackEventStatusCode.AtPickup;
      case "터미널 입고":
        return TrackEventStatusCode.InTransit;
      case "대리점 도착":
        return TrackEventStatusCode.InTransit;
      case "미배송":
        return TrackEventStatusCode.AttemptFail;
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

  private parseTime(date: string | null, time: string | null): DateTime | null {
    if (date === null || time === null) {
      this.logger.warn("date or time null");
      return null;
    }

    const result = DateTime.fromFormat(`${date} ${time}`, "yyyy.MM.dd HH:mm", {
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

export { SLX };

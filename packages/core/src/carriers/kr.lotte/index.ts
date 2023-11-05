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

    const response = await this.upstreamFetcher.fetch(
      "https://www.lotteglogis.com/home/reservation/tracking/linkView",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          InvNo: this.trackingNumber,
        }).toString(),
      }
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const tables = document.querySelectorAll("table");
    if (tables.length !== 2) {
      this.logger.warn("table count error");
    }
    const eventTrs = tables[1].querySelectorAll("tbody > tr");

    if (
      eventTrs.length === 1 &&
      eventTrs[0].querySelectorAll("td").length === 1
    ) {
      const message =
        eventTrs[0]
          .querySelector("td")
          ?.textContent?.replace(/\s+/g, " ")
          ?.trim() ?? null;
      throw new NotFoundError();
    }

    const events: TrackEvent[] = [];
    for (const event of eventTrs) {
      events.unshift(this.parseEvent(event));
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
    const time = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const description =
      tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time),
      location: this.parseLocation(location),
      contact: null,
      description,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "인수/상품접수":
        return TrackEventStatusCode.AtPickup;
      case "상품 이동중":
        return TrackEventStatusCode.InTransit;
      case "배송 출발":
        return TrackEventStatusCode.OutForDelivery;
      case "배달 완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      this.logger.warn("time null");
      return null;
    }
    if (time.endsWith("--:--")) {
      // TODO : 23:59 대신 이전 이벤트 기반으로 보정 필요
      time = `${time.substring(0, time.length - 5)}23:59`;
    }

    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm", {
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

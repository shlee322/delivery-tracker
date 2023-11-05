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
  carrierId: "kr.logen",
});

class Logen extends Carrier {
  readonly carrierId = "kr.logen";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new LogenTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class LogenTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    if (!/^\d+$/.test(this.trackingNumber)) {
      throw new BadRequestError(
        "잘못된 운송장 번호 입니다. 운송장 번호는 숫자로만 이루어져 있습니다."
      );
    }

    const response = await this.upstreamFetcher.fetch(
      `https://www.ilogen.com/web/personal/trace/${encodeURIComponent(
        this.trackingNumber
      )}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    if (
      traceResponseHtmlText.includes(
        "alert('잘못된 접근입니다. 운송장번호를 확인해주세요.')"
      )
    ) {
      throw new BadRequestError(
        "잘못된 접근입니다. 운송장번호를 확인해주세요."
      );
    }

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const empty = document.querySelector("tr.empty");
    if (empty !== null) {
      const message =
        empty.textContent?.replace(/\s+/g, " ")?.trim() ?? undefined;
      throw new NotFoundError(message);
    }

    const table = document.querySelector("table.data");
    if (table === null) {
      throw new InternalError();
    }

    const eventTrs = table.querySelectorAll("tbody > tr");

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
    let status = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const description =
      tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    if (status === "배송완료 사진확인") {
      status = "배송완료";
    }

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
      case "터미널입고":
        return TrackEventStatusCode.InTransit;
      case "터미널출고":
        return TrackEventStatusCode.InTransit;
      case "집하출고":
        return TrackEventStatusCode.InTransit;
      case "집하완료":
        return TrackEventStatusCode.InTransit;
      case "행낭적입":
        return TrackEventStatusCode.InTransit;
      case "배송입고":
        return TrackEventStatusCode.InTransit;
      case "배송출고":
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
      this.logger.warn("time null");
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

export { Logen };

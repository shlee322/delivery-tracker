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
import { JSDOM } from "jsdom";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "jp.sagawa",
});

class Sagawa extends Carrier {
  readonly carrierId = "jp.sagawa";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new SagawaTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class SagawaTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      okurijoNo: this.trackingNumber,
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?${queryString}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    if (document.querySelector("span.state")?.textContent === "該当なし") {
      const message = document
        .querySelector("#list1 tr:nth-child(2)")
        ?.textContent?.replace(/\s+/g, " ")
        ?.trim();
      if (message === "お荷物データが登録されておりません。") {
        throw new NotFoundError(message);
      }
      throw new BadRequestError(message);
    }

    const dd = document.querySelector('dd[id="detail1"]');
    if (dd === null) {
      throw new InternalError();
    }

    const tables = dd.querySelectorAll("table");
    const eventTrs = tables[1].querySelectorAll("tr:not(:first-child)");
    const startDate = this.parseStartDate(
      tables[0]
        .querySelectorAll("td")[1]
        .textContent?.replace(/\s+/g, " ")
        ?.trim() ?? null
    );

    const events: TrackEvent[] = [];
    for (const tr of eventTrs) {
      events.push(this.parseEvent(tr, startDate));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStartDate(text: string | null): DateTime {
    const match = text?.match(/(\d{4}年\d{2}月\d{2}日)/) ?? null;
    if (match === null) {
      return DateTime.now().setZone("Asia/Tokyo");
    }
    const result = DateTime.fromFormat(match[1], "yyyy年MM月dd日", {
      zone: "Asia/Tokyo",
    });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: match[1],
        invalidReason: result.invalidReason,
      });
    }
    return result;
  }

  private parseEvent(tr: Element, startDate: DateTime): TrackEvent {
    const tds = tr.querySelectorAll("td");
    const status = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const time = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time, startDate),
      location: {
        name: location,
        countryCode: "JP",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: `${location ?? ""} - ${status ?? ""}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(text: string | null): TrackEventStatusCode {
    switch (text) {
      case "↓集荷":
        return TrackEventStatusCode.AtPickup;
      case "↓輸送中":
        return TrackEventStatusCode.InTransit;
      case "↓配達中":
        return TrackEventStatusCode.OutForDelivery;
      case "⇒配達完了":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      text,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null, startDate: DateTime): DateTime | null {
    if (time === null) {
      return null;
    }
    const result = DateTime.fromFormat(time, "MM/dd HH:mm", {
      zone: "Asia/Tokyo",
    });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    const estimatedTime = result.set({ year: startDate.year });
    if (startDate <= estimatedTime) {
      return estimatedTime;
    } else {
      return estimatedTime.plus({ years: 1 });
    }
  }
}

export { Sagawa };

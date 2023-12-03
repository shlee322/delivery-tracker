import { type Logger } from "winston";
import { parsePhoneNumber } from "libphonenumber-js";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type ContactInfo,
} from "../../core";
import { rootLogger } from "../../logger";
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.goodstoluck",
});

class GoodsToLuck extends Carrier {
  readonly carrierId = "kr.goodstoluck";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new GoodsToLuckTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class GoodsToLuckTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "http://www.goodstoluck.co.kr/tracking/tracking_proc.php",
      {
        method: "POST",
        headers: [
          ["content-type", "application/x-www-form-urlencoded; charset=UTF-8"],
        ],
        body: new URLSearchParams({
          RetrieveFlag: "SEARCH",
          Txt_word: this.trackingNumber,
        }).toString(),
      }
    );

    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const notFound = document.querySelector("table.result_none_tb");
    if (notFound !== null) {
      throw new NotFoundError(
        notFound.textContent?.replace(/\s+/g, " ")?.trim() ?? "Not found"
      );
    }

    const tables = document.querySelectorAll("table");

    if (tables.length !== 2) {
      this.logger.warn("tables.length !== 2");
    }

    const info = tables[0].querySelectorAll("tr:nth-child(2) > td");
    const eventTrs = tables[1].querySelectorAll("tr:not(:first-child)");

    const events: TrackEvent[] = [];
    for (const tr of eventTrs) {
      const event = this.parseEvent(tr);
      if (event !== null) {
        events.push(event);
      }
    }

    return {
      events,
      sender: {
        name: info[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      recipient: {
        name: info[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(tr: Element): TrackEvent | null {
    const tds = tr.querySelectorAll("td");

    const time = this.parseTime(
      tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null
    );

    const location = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const phone = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const statusText = tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    const contact = this.parseEventContact(location, phone);
    return {
      status: {
        code: this.parseStatusCode(statusText),
        name: statusText,
        carrierSpecificData: new Map(),
      },
      time,
      location: contact?.location ?? null,
      contact,
      description: `${statusText ?? ""} - ${location ?? ""}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseEventContact(
    locationName: string | null,
    phoneNumber: string | null
  ): ContactInfo | null {
    let phoneNumberObj = null;
    if (phoneNumber != null) {
      try {
        phoneNumberObj = parsePhoneNumber(phoneNumber, "KR");
      } catch (e) {
        this.logger.warn("Failed to parse phone number (parseContact)", {
          text: phoneNumber,
          error: e,
        });
      }
    }

    return {
      name: locationName ?? null,
      phoneNumber: phoneNumberObj,
      location: {
        name: locationName ?? null,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "간선하차":
      case "간선상차":
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
      return null;
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
}

export { GoodsToLuck };

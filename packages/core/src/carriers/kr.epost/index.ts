import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type Location,
  type ContactInfo,
} from "../../core";
import { rootLogger } from "../../logger";
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { map } from "cheerio/lib/api/traversing";

const carrierLogger = rootLogger.child({
  carrierId: "kr.epost",
});

class KoreaPost extends Carrier {
  readonly carrierId = "kr.epost";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new KoreaPostTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class KoreaPostTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      sid1: this.trackingNumber,
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?${queryString}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const eventTrs = document.querySelectorAll("#processTable > tbody > tr");
    if (eventTrs.length < 1) {
      throw new NotFoundError();
    }

    const events: TrackEvent[] = [];
    for (const event of eventTrs) {
      events.push(this.parseEvent(event));
    }

    const senderAndRecipient = this.parseSenderAndRecipient(document);

    return {
      events,
      ...senderAndRecipient,
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(tr: Element): TrackEvent {
    const tds = tr.querySelectorAll("td");
    const date = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const time = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const status = tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

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
    if (status === null) {
      this.logger.warn("status null");
      return TrackEventStatusCode.Unknown;
    }

    switch (status) {
      case "운송장출력":
        return TrackEventStatusCode.InformationReceived;
      case "접수":
        return TrackEventStatusCode.InformationReceived;
      case "접수 마감 후 접수(익일발송)":
        return TrackEventStatusCode.InformationReceived;
      case "발송":
        return TrackEventStatusCode.InTransit;
      case "도착":
        return TrackEventStatusCode.InTransit;
    }

    if (status.includes("배달준비")) {
      return TrackEventStatusCode.OutForDelivery;
    }
    if (status.includes("배달완료")) {
      return TrackEventStatusCode.Delivered;
    }
    if (status.includes("신청취소")) {
      return TrackEventStatusCode.Exception;
    }
    if (status.includes("접수취소")) {
      return TrackEventStatusCode.Exception;
    }
    if (status.includes("미배달")) {
      return TrackEventStatusCode.AttemptFail;
    }
    if (status.includes("인수완료")) {
      return TrackEventStatusCode.AtPickup;
    }
    if (status.includes("집하완료")) {
      return TrackEventStatusCode.InTransit;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(date: string | null, time: string | null): DateTime | null {
    if (date === null) {
      this.logger.warn("date or time null");
      return null;
    }
    if (time === null) {
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
      countryCode: null,
      postalCode: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseSenderAndRecipient(document: Document): {
    sender: ContactInfo | null;
    recipient: ContactInfo | null;
  } {
    try {
      const tds =
        document
          .querySelector("table.table_col > tbody")
          ?.querySelectorAll("td") ?? [];

      return {
        sender: this.parseContactInfo(tds[0] ?? null),
        recipient: this.parseContactInfo(tds[1] ?? null),
      };
    } catch (e) {
      this.logger.warn("parseSenderAndRecipient error", {
        error: e,
      });
      return {
        sender: null,
        recipient: null,
      };
    }
  }

  private parseContactInfo(element: HTMLElement | null): ContactInfo | null {
    if (element === null) {
      return null;
    }
    const contactInfoHtml = element.innerHTML;
    const contactInfoBrIndex = contactInfoHtml.indexOf("<br>");

    let name = contactInfoHtml;
    if (contactInfoBrIndex !== -1) {
      name = contactInfoHtml.substring(0, contactInfoBrIndex);
    }
    return {
      name: name.replace(/\s+/g, " ")?.trim(),
      location: null,
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };
  }
}

export { KoreaPost };

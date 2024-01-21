import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  type TrackEventStatus,
  TrackEventStatusCode,
  type Location,
  type ContactInfo,
} from "../../core";
import { rootLogger } from "../../logger";
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.epost.ems",
});

class KoreaPostEMS extends Carrier {
  readonly carrierId = "kr.epost.ems";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new KoreaPostEMSTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class KoreaPostEMSTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      POST_CODE: this.trackingNumber,
      displayHeader: "N",
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://service.epost.go.kr/trace.RetrieveEmsRigiTraceList.comm?${queryString}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const eventTrs = document.querySelectorAll("table.detail_off > tbody > tr");
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
    const time = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const status = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    let description = tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    if (description === "") {
      description = `${status ?? ""} - ${location ?? ""}`;
    }

    return {
      status: this.parseStatus(status),
      time: this.parseTime(time),
      location: this.parseLocation(location),
      contact: null,
      description,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(status: string | null): TrackEventStatus {
    if (status === null) {
      this.logger.warn("status null");
      return {
        code: TrackEventStatusCode.Unknown,
        name: null,
        carrierSpecificData: new Map(),
      };
    }

    switch (status) {
      case "접수":
        return {
          code: TrackEventStatusCode.InformationReceived,
          name: status,
          carrierSpecificData: new Map(),
        };
      case "발송준비":
      case "교환국 도착":
      case "발송":
      case "도착":
        return {
          code: TrackEventStatusCode.InTransit,
          name: status,
          carrierSpecificData: new Map(),
        };
    }

    if (status.includes("배달준비")) {
      return {
        code: TrackEventStatusCode.OutForDelivery,
        name: "배달준비",
        carrierSpecificData: new Map(),
      };
    }
    if (status.includes("배달완료")) {
      return {
        code: TrackEventStatusCode.Delivered,
        name: "배달완료",
        carrierSpecificData: new Map(),
      };
    }
    this.logger.warn("Unexpected status code", {
      status,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: status,
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

export { KoreaPostEMS };

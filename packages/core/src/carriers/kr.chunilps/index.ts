import {
  Carrier,
  type ContactInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackInfo,
  type TrackEventStatus,
  type CarrierTrackInput,
} from "../../core";
import { rootLogger } from "../../logger";
import { JSDOM } from "jsdom";
import { NotFoundError } from "../../core/errors";
import { parsePhoneNumber, type PhoneNumber } from "libphonenumber-js";
import { type Logger } from "winston";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.chunilps",
});

class Chunilps extends Carrier {
  readonly carrierId = "kr.chunilps";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new ChunilpsTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class ChunilpsTrackScraper {
  private readonly logger: Logger;
  private readonly carrierSpecificDataPrefix = "kr.chunilps";

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      transNo: this.trackingNumber,
    }).toString();
    const traceResponse = await this.upstreamFetcher.fetch(
      `http://www.chunil.co.kr/HTrace/HTrace.jsp?${queryString}`
    );

    const traceResponseHtmlText = await traceResponse.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;
    const tables = document.querySelectorAll('table[cellspacing="1"]');

    if (tables.length === 0) {
      throw new NotFoundError(
        "운송장이 등록되지 않았거나 업체에서 상품을 준비중이니 업체로 문의해주시기 바랍니다."
      );
    }

    if (tables.length !== 7) {
      this.logger.warn("Unexpected table count", {
        count: tables.length,
      });
    }

    const senderElements = tables[0].querySelectorAll("td:nth-child(2n)");
    const recipientElements = tables[1].querySelectorAll("td:nth-child(2n)");
    const itemElements = tables[2].querySelectorAll("td:nth-child(2n)");
    const eventElements = tables[4].querySelectorAll("tr:not(:first-child)");

    const sender: ContactInfo = {
      name: senderElements[0].textContent?.trim() ?? null,
      location: null,
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };

    const recipient: ContactInfo = {
      name: recipientElements[0].textContent?.trim() ?? null,
      location: null,
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };

    const events = this.parseEvents(eventElements);
    const carrierSpecificData = new Map();

    this.parseBranchInfoToCarrierSpecificData(
      "dispatch",
      senderElements[1].textContent?.trim() ?? null
    ).forEach((value, key) => {
      carrierSpecificData.set(key, value);
    });

    this.parseBranchInfoToCarrierSpecificData(
      "arrival",
      recipientElements[1].textContent?.trim() ?? null
    ).forEach((value, key) => {
      carrierSpecificData.set(key, value);
    });

    carrierSpecificData.set(
      `${this.carrierSpecificDataPrefix}/item.name`,
      itemElements[0].textContent?.trim()
    );
    carrierSpecificData.set(
      `${this.carrierSpecificDataPrefix}/item.quantity`,
      itemElements[1].textContent?.trim()
    );
    carrierSpecificData.set(
      `${this.carrierSpecificDataPrefix}/item.cost`,
      itemElements[2].textContent?.replace(/\s+/g, " ")?.trim()
    );

    return {
      sender,
      recipient,
      events,
      carrierSpecificData,
    };
  }

  private parseEvents(eventElements: NodeListOf<Element>): TrackEvent[] {
    const events: TrackEvent[] = [];

    for (const eventElement of eventElements) {
      const tds = eventElement.querySelectorAll("td");
      if (tds.length !== 4) {
        this.logger.warn("Unexpected td count", {
          count: tds.length,
        });
      }

      const contact = this.parseContact(tds[1].textContent, tds[2].textContent);
      events.push({
        status: this.parseStatus(tds[3].textContent),
        time: this.parseTime(tds[0].textContent),
        contact,
        location: contact?.location ?? null,
        description: null,
        carrierSpecificData: new Map(),
      });
    }
    return events;
  }

  private parseStatus(text: string | null): TrackEventStatus {
    return {
      code: this.parseStatusCode(text),
      name: text,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(text: string | null): TrackEventStatusCode {
    switch (text) {
      case null:
        return TrackEventStatusCode.Unknown;
      case "접수":
        return TrackEventStatusCode.InformationReceived;
      case "발송":
        return TrackEventStatusCode.AtPickup;
      case "간선상차":
      case "간선하차":
      case "발송터미널하차":
      case "발송터미널출발":
      case "도착터미널하차":
      case "영업소도착":
        return TrackEventStatusCode.InTransit;
      case "배송완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      text,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      return null;
    }
    const result = DateTime.fromISO(time, { zone: "Asia/Seoul" });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
    }
    return result;
  }

  private parseContact(
    name: string | null,
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
      name: name ?? null,
      phoneNumber: phoneNumberObj,
      location: {
        name: name ?? null,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseBranchInfoToCarrierSpecificData(
    branchType: string,
    text: string | null
  ): Map<string, string> {
    const carrierSpecificData = new Map();

    if (text == null) {
      return carrierSpecificData;
    }

    const branch = this.parseBranchInfo(text);
    carrierSpecificData.set(
      `${this.carrierSpecificDataPrefix}/branch.${branchType}.name`,
      branch.name
    );
    if (branch.phoneNumber?.number != null) {
      carrierSpecificData.set(
        `${this.carrierSpecificDataPrefix}/branch.${branchType}.phoneNumber`,
        branch.phoneNumber.number
      );
    }

    return carrierSpecificData;
  }

  private parseBranchInfo(text: string): ChunilpsBranchInfo {
    const regex = /^(\S+)\s\((\d{3}-\d{3,4}-\d{4})?\)$/;
    const match = text.match(regex);

    if (match == null) {
      this.logger.warn("Failed to parse branch info", {
        text,
      });
      return {
        name: text,
        phoneNumber: null,
      };
    }

    let phoneNumber = null;

    if (match[2] !== undefined) {
      try {
        phoneNumber = parsePhoneNumber(match[2], "KR");
      } catch (e) {
        this.logger.warn("Failed to parse phone number", {
          text,
          error: e,
        });
      }
    }

    return {
      name: match[1],
      phoneNumber,
    };
  }
}

interface ChunilpsBranchInfo {
  name: string;
  phoneNumber: PhoneNumber | null;
}

export { Chunilps };

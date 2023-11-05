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
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { BadRequestError, NotFoundError } from "../../core/errors";

const carrierLogger = rootLogger.child({
  carrierId: "un.upu.ems",
});

class EMS extends Carrier {
  readonly carrierId = "un.upu.ems";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new EMSTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class EMSTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      language: "EN",
      itemId: this.trackingNumber,
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://items.ems.post/api/publicTracking/track?${queryString}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const notFoundTd = document.querySelector("td.no-results-found");
    if (notFoundTd !== null) {
      throw new NotFoundError(
        notFoundTd.textContent?.replace(/\s+/g, " ")?.trim()
      );
    }

    const errorUl = document.querySelector("ul.error");
    if (errorUl !== null) {
      const errorMessage = errorUl.textContent?.replace(/\s+/g, " ")?.trim();
      throw new BadRequestError(errorMessage);
    }

    const eventTrs = document.querySelectorAll("tbody > tr");

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
    const status = tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time),
      location: this.parseLocation(location),
      contact: null,
      description: status,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    if (status === null) {
      this.logger.warn("status null");
      return TrackEventStatusCode.Unknown;
    }

    switch (status) {
      case "Posted":
        return TrackEventStatusCode.AtPickup;
      case "Arrived at export office":
        return TrackEventStatusCode.InTransit;
      case "Departed from export office":
        return TrackEventStatusCode.InTransit;
      case "Arrived at sorting center":
        return TrackEventStatusCode.InTransit;
      case "Arrived at destination import office":
        return TrackEventStatusCode.InTransit;
      case "Presented to import customs":
        return TrackEventStatusCode.InTransit;
      case "Held for customs inspection":
        return TrackEventStatusCode.InTransit;
      case "Released from import customs":
        return TrackEventStatusCode.InTransit;
      case "Departed from destination import office":
        return TrackEventStatusCode.InTransit;
      case "Arrived at post office":
        return TrackEventStatusCode.InTransit;
      case "Out for delivery":
        return TrackEventStatusCode.OutForDelivery;
      case "Delivered":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      this.logger.warn("date or time null");
      return null;
    }

    const result = DateTime.fromFormat(time, "MMM d, yyyy h:mm a", {
      zone: "UTC", // FIX ME
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
}

export { EMS };

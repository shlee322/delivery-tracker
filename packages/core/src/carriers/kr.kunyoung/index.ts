import { type Logger } from "winston";
import { JSDOM } from "jsdom";
import * as IconvLite from "iconv-lite";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.kunyoung",
});

class Kunyoung extends Carrier {
  readonly carrierId = "kr.kunyoung";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new KunyoungTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class KunyoungTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      mulno: this.trackingNumber,
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://www.kunyoung.com/goods/goods_02.php?${queryString}`
    );
    const traceResponseHtmlText = IconvLite.decode(
      Buffer.from(await response.arrayBuffer()),
      "euc-kr"
    );
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const tables = document.querySelectorAll('table[width="717"]');
    if (tables.length !== 4) {
      this.logger.warn("table count error");
    }

    const eventTrs = tables[3].querySelectorAll("tr:nth-child(2n+4)");

    const events: TrackEvent[] = [];
    for (const event of eventTrs) {
      events.push(this.parseEvent(event));
    }

    if (this.isNotFound(events)) {
      throw new NotFoundError();
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
    const status = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time),
      location: null,
      contact: null,
      description: status,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    if (status === null) {
      this.logger.warn("status code null");
      return TrackEventStatusCode.Unknown;
    }

    if (status.endsWith("배송완료")) {
      return TrackEventStatusCode.Delivered;
    }

    if (status.endsWith("발송")) {
      return TrackEventStatusCode.InTransit;
    }

    if (status.endsWith("도착")) {
      return TrackEventStatusCode.InTransit;
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
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss", {
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

  private isNotFound(events: TrackEvent[]): boolean {
    if (events.length !== 4) return false;
    if (
      events[0].time?.toISO() !== "2022-11-23T08:42:22.000+09:00" ||
      events[0].status?.name !== "도착"
    )
      return false;

    if (
      events[1].time?.toISO() !== "2022-11-23T09:42:22.000+09:00" ||
      events[1].status?.name !== "영덕도착"
    )
      return false;

    if (
      events[2].time?.toISO() !== "2022-12-01T06:45:10.000+09:00" ||
      events[2].status?.name !== "도착"
    )
      return false;

    if (
      events[3].time?.toISO() !== "2022-12-01T09:08:43.000+09:00" ||
      events[3].status?.name !== "도착"
    )
      return false;

    return true;
  }
}

export { Kunyoung };

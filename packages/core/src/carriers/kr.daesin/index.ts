import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type MaskedPhoneNumber,
  type TrackEventStatus,
} from "../../core";
import { rootLogger } from "../../logger";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { type z } from "zod";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import { type PhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import { type CarrierUpstreamFetcher } from "../..";
import * as IconvLite from "iconv-lite";

const carrierLogger = rootLogger.child({
  carrierId: "kr.daesin",
});

class Daesin extends Carrier {
  readonly carrierId = "kr.daesin";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new DaesinTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

enum EventType {
  Enter,
  Leave,
}

class DaesinTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "https://www.ds3211.co.kr/freight/internalFreightSearch.ht",
      {
        method: "POST",
        headers: [["content-type", "application/x-www-form-urlencoded"]],
        body: new URLSearchParams({
          billno: this.trackingNumber,
        }).toString(),
      }
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
    const printarea = document?.querySelector('div[id="printarea"]');

    if (printarea === null) {
      throw new InternalError();
    }

    const tables = printarea.querySelectorAll("table");

    if (tables.length === 0) {
      const message =
        printarea
          .querySelector("div.effect")
          ?.textContent?.replace(/\s+/g, " ")
          ?.trim() ?? undefined;
      if (message?.endsWith("운송된 내역이 없습니다.") === true) {
        throw new NotFoundError(message);
      }

      throw new BadRequestError(message);
    }

    const infoTds = tables[0].querySelectorAll("td");
    const eventTrs = tables[1].querySelectorAll("tr:not(:first-child)");

    const events: TrackEvent[] = [];
    for (const tr of eventTrs) {
      events.push(...this.parseEvent(tr));
    }

    return {
      sender: {
        name: infoTds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
        location: null,
        phoneNumber: this.parseMaskedPhoneNumber(
          infoTds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null
        ),
        carrierSpecificData: new Map(),
      },
      recipient: {
        name: infoTds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
        location: null,
        phoneNumber: this.parseMaskedPhoneNumber(
          infoTds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null
        ),
        carrierSpecificData: new Map(),
      },
      events,
      carrierSpecificData: new Map(),
    };
  }

  private parseMaskedPhoneNumber(
    text: string | null
  ): MaskedPhoneNumber | null {
    if (text === null) {
      return null;
    }
    return {
      "@type": "@delivery-tracker/core/MaskedPhoneNumber",
      maskedPhoneNumber: `+82${text.replaceAll("*", "X").replace(/^0+/, "")}`,
    };
  }

  private parseEvent(tr: Element): TrackEvent[] {
    const tds = tr.querySelectorAll("td");

    // 중간 운송중인 경우 UI 상 운송 목적지 tr의 도착(접수)일시 / 출발(배달)일시 td 를 합쳐서 colspan="2" 로 표기하고 아무런 time이 표기되어 있지 않음
    if (tds[3].getAttribute("colspan") === "2") {
      return [];
    }

    const status = tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    const location = {
      name: tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
      countryCode: "KR",
      postalCode: null,
      carrierSpecificData: new Map(),
    };
    const phoneNumber = this.parseLocationPhoneNumber(
      tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null
    );

    const enterTime = tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const leaveTime = tds[4].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const currentLocation =
      tds[5].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    const events = [];
    for (const eventType of [EventType.Enter, EventType.Leave]) {
      if (
        eventType === EventType.Leave &&
        (leaveTime === null || leaveTime === "")
      ) {
        continue;
      }
      events.push({
        status: this.parseStatus(status, eventType, currentLocation),
        time: this.parseTime(
          eventType === EventType.Enter ? enterTime : leaveTime
        ),
        location,
        contact: {
          name: location.name,
          location,
          phoneNumber,
          carrierSpecificData: new Map(),
        },
        description: null,
        carrierSpecificData: new Map(),
      });

      if (
        eventType === EventType.Enter &&
        (currentLocation === "배달중" || currentLocation === "배송완료")
      ) {
        events.push({
          status: {
            code: TrackEventStatusCode.OutForDelivery,
            name: "배달중",
            carrierSpecificData: new Map(),
          },
          time: this.parseTime(enterTime),
          location,
          contact: {
            name: location.name,
            location,
            phoneNumber,
            carrierSpecificData: new Map(),
          },
          description: null,
          carrierSpecificData: new Map(),
        });
      }
    }

    return events;
  }

  private parseLocationPhoneNumber(text: string | null): PhoneNumber | null {
    const match = text?.match(/(\d{3}-\d{4}-\d{4})/g) ?? null;
    if (match === null) {
      return null;
    }
    try {
      return parsePhoneNumber(match[0], "KR");
    } catch (e) {
      this.logger.warn("parsePhoneNumber failed", {
        error: e,
        text: match[0],
      });
    }

    return null;
  }

  private parseStatus(
    status: string | null,
    eventType: EventType,
    currentLocation: string | null
  ): TrackEventStatus {
    if (currentLocation === "배송완료" && eventType === EventType.Leave) {
      return {
        code: TrackEventStatusCode.Delivered,
        name: "배송완료",
        carrierSpecificData: new Map(),
      };
    }

    if (status === "발송취급점" && eventType === EventType.Enter) {
      return {
        code: TrackEventStatusCode.InformationReceived,
        name: "접수",
        carrierSpecificData: new Map(),
      };
    }

    return {
      code: TrackEventStatusCode.InTransit,
      name: `${status ?? ""} - ${
        eventType === EventType.Enter ? "도착" : "출발"
      }`,
      carrierSpecificData: new Map(),
    };
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
    }
    return result;
  }
}

export { Daesin };

import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackEventStatus,
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
  carrierId: "kr.hanjin",
});

class Hanjin extends Carrier {
  readonly carrierId = "kr.hanjin";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new HanjinTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class HanjinTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    if (this.trackingNumber.match(/^[0-9]+$/) === null) {
      throw new BadRequestError("잘못된 운송장번호 입니다.");
    }

    if (
      this.trackingNumber.length !== 12 &&
      this.trackingNumber.length !== 14
    ) {
      throw new BadRequestError("잘못된 운송장번호 입니다.");
    }

    const response = await this.upstreamFetcher.fetch(
      "https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do",
      {
        method: "POST",
        headers: [["content-type", "application/x-www-form-urlencoded"]],
        body: new URLSearchParams({
          wblnum: this.trackingNumber,
          mCode: "MN038",
          schLang: "KR",
        }).toString(),
      }
    );
    if (response.status === 403) {
      throw new InternalError("hanjin 403 error");
    }
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    // 상황에 따라 alert("message") 로 표시되는 경우가 있음
    if (
      traceResponseHtmlText.length < 2000 &&
      traceResponseHtmlText.includes("운송장이 등록되지 않")
    ) {
      throw new NotFoundError();
    }

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const comm = document.querySelector(".comm-sec");
    if (comm != null) {
      const message = comm.textContent?.trim() ?? "";
      if (message.includes("운송장이 등록되지 않")) {
        throw new NotFoundError(message);
      }
      if (message.includes("잘못된 운송장")) {
        throw new BadRequestError(message);
      }
    }

    const tables = document.querySelectorAll("table");
    const infoTds = tables[0].querySelectorAll("td");
    const eventTrs = tables[1].querySelectorAll("tr");

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
        name: infoTds[1].textContent ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      recipient: {
        name: infoTds[2].textContent ?? null,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map(),
      },
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(tr: Element): TrackEvent | null {
    const tds = tr.querySelectorAll("td");
    // 간혹 <tr></tr> 형태가 섞여있음
    if (tds.length < 4) return null;

    const time = this.parseTime(
      tds[0].textContent?.replace(/\s+/g, " ")?.trim() ?? null,
      tds[1].textContent?.replace(/\s+/g, " ")?.trim() ?? null
    );
    const location = tds[2].textContent?.replace(/\s+/g, " ")?.trim() ?? null;
    const description =
      tds[3].textContent?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: this.parseStatus(description),
      time,
      location: {
        name: location,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(description: string | null): TrackEventStatus {
    if (description === null) {
      return {
        code: TrackEventStatusCode.Unknown,
        name: null,
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("통관목록이 접수")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "목록통관 접수",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("목록통관 심사가 완료")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "목록통관 심사 완료",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("하선신고가 수리")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "하선신고 수리",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("선편으로 출발 대기")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "출발 대기",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("수입신고가 접수")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "수입신고 접수",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("수입통관이 완료")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "수입통관 완료",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("수입신고가 수리")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "수입신고 수리",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("수입신고 진행")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "수입신고 진행",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("하선신고가 수리")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "하선신고 수리",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("수입통관장에 반입")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "수입통관장 반입",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("항공편으로 출발 대기")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "출발 대기",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("항공편이 도착")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "항공편 도착",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("상품 출고 대기")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "상품 출고 대기",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("관부가세 납부 대기 중")) {
      return {
        code: TrackEventStatusCode.Exception,
        name: "관부가세 납부 대기",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("접수")) {
      return {
        code: TrackEventStatusCode.InformationReceived,
        name: "접수",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("운송장 정보가 등록되었습니다")) {
      return {
        code: TrackEventStatusCode.InformationReceived,
        name: "운송장 등록",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("로 이동중")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "터미널 상차",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("에 도착")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "터미널 하차",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("에 입고")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "터미널 하차",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("배송을 준비중")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "배송 준비",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("배송준비중")) {
      return {
        code: TrackEventStatusCode.InTransit,
        name: "배송 준비",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("배송출발")) {
      return {
        code: TrackEventStatusCode.OutForDelivery,
        name: "배송 출발",
        carrierSpecificData: new Map(),
      };
    }

    if (description?.includes("배송완료")) {
      return {
        code: TrackEventStatusCode.Delivered,
        name: "배송 완료",
        carrierSpecificData: new Map(),
      };
    }

    if (description === "운송장 정보가 등록되었습니다.") {
      return {
        code: TrackEventStatusCode.InformationReceived,
        name: "운송장 등록",
        carrierSpecificData: new Map(),
      };
    }

    this.logger.warn("Unexpected status code", {
      description,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(date: string | null, time: string | null): DateTime | null {
    if (date === null) {
      return null;
    }
    if (time === null) {
      time = "00:00";
    }

    const result = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", {
      zone: "Asia/Seoul",
    });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputDate: date,
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }
}

export { Hanjin };

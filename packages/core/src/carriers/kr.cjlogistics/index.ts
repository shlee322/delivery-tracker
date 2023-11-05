import { Cookie } from "tough-cookie";
import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { parsePhoneNumber } from "libphonenumber-js";
import {
  Carrier,
  type ContactInfo,
  type Location,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackInfo,
  type TrackEventStatus,
  type CarrierTrackInput,
} from "../../core";
import { BadRequestError, NotFoundError } from "../../core/errors";
import { rootLogger } from "../../logger";
import {
  type CJLogisticsTrackingDetailResponse,
  type CJLogisticsTrackingDetailResponseParcelDetailResultMapResult,
  CJLogisticsTrackingDetailResponseSchema,
} from "./CJLogisticsAPISchemas";
import { type Logger } from "winston";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.cjlogistics",
});

class CJLogistics extends Carrier {
  readonly carrierId = "kr.cjlogistics";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new CJLogisticsTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class CJLogisticsTrackScraper {
  private readonly logger: Logger;
  private readonly carrierSpecificDataPrefix = "kr.cjlogistics";

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    if (!/^(\d{10}(\d{2})?)?$/.test(this.trackingNumber)) {
      throw new BadRequestError("운송장 번호는 10자리 혹은 12자리입니다.");
    }

    const mainPageResponse = await this.upstreamFetcher.fetch(
      "https://www.cjlogistics.com/ko/tool/parcel/tracking"
    );
    const cookieHeaders =
      mainPageResponse.headers
        .get("set-cookie")
        ?.split(",")
        .map((cookieString) => cookieString.trim())
        .map((cookieString) => Cookie.parse(cookieString))
        .map((cookie) => cookie?.cookieString() ?? null)
        .join("; ") ?? null;

    const $ = cheerio.load(await mainPageResponse.text());
    const csrf = $("input[name=_csrf]").val() as string;

    const queryString = new URLSearchParams({
      paramInvcNo: this.trackingNumber,
      _csrf: csrf,
    }).toString();

    const headers: Array<[string, string]> = [];
    if (cookieHeaders !== null) {
      headers.push(["cookie", cookieHeaders]);
    }

    const trackingDetailResponse = await this.upstreamFetcher.fetch(
      `https://www.cjlogistics.com/ko/tool/parcel/tracking-detail?${queryString}`,
      {
        method: "POST",
        headers,
      }
    );

    const trackingDetailBody: CJLogisticsTrackingDetailResponse =
      await trackingDetailResponse.json();
    this.logger.debug("trackingDetailResponse", {
      trackingDetailBody,
    });

    // 타입이 잘못된 경우 로깅만 하고 실제 동작은 최대한 돌아가게 한다.
    const safeParseResult =
      await CJLogisticsTrackingDetailResponseSchema.strict().safeParseAsync(
        trackingDetailBody
      );
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        trackingDetailBody,
      });
    }

    const parcelResult =
      trackingDetailBody.parcelResultMap.resultList.at(0) ?? null;
    const events: TrackEvent[] =
      trackingDetailBody.parcelDetailResultMap.resultList.map(
        (parcelDetailResult) => {
          return this.parseTrackEvent(parcelDetailResult);
        }
      );

    if (parcelResult === null && events.length === 0) {
      throw new NotFoundError();
    }

    if (parcelResult === null) {
      return {
        events,
        sender: null,
        recipient: null,
        carrierSpecificData: new Map([]),
      };
    }

    const sender: ContactInfo = {
      name: parcelResult.sendrNm,
      location: null,
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };
    const recipient: ContactInfo = {
      name: parcelResult.rcvrNm,
      location: null,
      phoneNumber: null,
      carrierSpecificData: new Map(),
    };

    return {
      events,
      sender,
      recipient,
      carrierSpecificData: new Map([
        [`${this.carrierSpecificDataPrefix}/raw/itemNm`, parcelResult.itemNm],
        [`${this.carrierSpecificDataPrefix}/raw/qty`, parcelResult.qty],
        [
          `${this.carrierSpecificDataPrefix}/raw/rgmailNo`,
          parcelResult.rgmailNo,
        ],
        [
          `${this.carrierSpecificDataPrefix}/raw/oriTrspbillnum`,
          parcelResult.oriTrspbillnum,
        ],
        [
          `${this.carrierSpecificDataPrefix}/raw/rtnTrspbillnum`,
          parcelResult.rtnTrspbillnum,
        ],
        [`${this.carrierSpecificDataPrefix}/raw/nsDlvNm`, parcelResult.nsDlvNm],
      ]),
    };
  }

  private parseTrackEvent(
    parcelDetailResult: CJLogisticsTrackingDetailResponseParcelDetailResultMapResult
  ): TrackEvent {
    return {
      status: this.parseStatus(parcelDetailResult),
      time: this.parseTime(parcelDetailResult.dTime),
      location: this.parseLocation(parcelDetailResult),
      contact: this.parseContact(parcelDetailResult),
      description: parcelDetailResult.crgNm,
      carrierSpecificData: new Map([
        // ["kr.cjlogistics/raw/nsDlNm", parcelDetailResult.nsDlNm],
        [
          `${this.carrierSpecificDataPrefix}/raw/empImgNm`,
          parcelDetailResult.empImgNm,
        ],
      ]),
    };
  }

  private parseLocation(
    parcelDetailResult: CJLogisticsTrackingDetailResponseParcelDetailResultMapResult
  ): Location {
    return {
      countryCode: "KR",
      name: parcelDetailResult.regBranNm,
      postalCode: null,
      carrierSpecificData: new Map([
        [
          `${this.carrierSpecificDataPrefix}/raw/regBranId`,
          parcelDetailResult.regBranId,
        ],
      ]),
    };
  }

  private parseContact(
    parcelDetailResult: CJLogisticsTrackingDetailResponseParcelDetailResultMapResult
  ): ContactInfo | null {
    const regex = /([가-힣]{2,4})\s(\d{3}-\d{3,4}-\d{4})/;
    const match = parcelDetailResult.crgNm.match(regex);

    if (match == null) {
      return null;
    }

    let phoneNumber = null;
    try {
      phoneNumber = parsePhoneNumber(match[2], "KR");
    } catch (e) {
      this.logger.warn("parsePhoneNumber failed", {
        error: e,
        text: match[2],
      });
    }

    return {
      name: match[1],
      location: this.parseLocation(parcelDetailResult),
      phoneNumber,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss", {
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

  private parseStatus(
    parcelDetailResult: CJLogisticsTrackingDetailResponseParcelDetailResultMapResult
  ): TrackEventStatus {
    return {
      code: this.parseStatusCode(parcelDetailResult.crgSt),
      name: parcelDetailResult.scanNm,
      carrierSpecificData: new Map([
        [
          `${this.carrierSpecificDataPrefix}/raw/crgSt`,
          parcelDetailResult.crgSt,
        ],
      ]),
    };
  }

  private parseStatusCode(crgSt: string): TrackEventStatusCode {
    switch (crgSt) {
      case "11":
        return TrackEventStatusCode.AtPickup;
      case "21":
      case "41":
      case "42":
      case "44":
        return TrackEventStatusCode.InTransit;
      case "82":
        return TrackEventStatusCode.OutForDelivery;
      case "91":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("parseStatusCode Unknown", {
      crgSt,
    });
    return TrackEventStatusCode.Unknown;
  }
}

export { CJLogistics };

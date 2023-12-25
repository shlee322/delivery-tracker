import { type Logger } from "winston";
import { DateTime } from "luxon";
import { type z } from "zod";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type TrackEventStatus,
  type CarrierInitInput,
} from "../../core";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { rootLogger } from "../../logger";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import * as schema from "./LTLAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.ltl",
});

interface LTLConfig {
  accessId: string;
  accessKey: string;
}

class LTL extends Carrier {
  readonly carrierId = "kr.ltl";
  private config: LTLConfig | null = null;

  public async init(
    input: CarrierInitInput & { config: LTLConfig }
  ): Promise<void> {
    await super.init(input);
    this.config = input.config;
  }

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    if (this.config == null) {
      throw new Error("LTL is not initialized");
    }

    return await new LTLScraper(
      this.config,
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class LTLScraper {
  private readonly logger: Logger;

  constructor(
    readonly config: LTLConfig,
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      number: this.trackingNumber,
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://api.ltl.kr/api/search-invoice-info?${queryString}`,
      {
        method: "POST",
        headers: [
          ["accessid", this.config.accessId],
          ["accesskey", this.config.accessKey],
        ],
      }
    );

    const searchInvoiceInfoResponseJson: z.infer<
      typeof schema.SearchInvoiceInfoResponseSchema
    > = await response.json();
    this.logger.debug("searchInvoiceInfoResponseJson", {
      searchInvoiceInfoResponseJson,
    });

    if (searchInvoiceInfoResponseJson.status !== "100") {
      if (
        searchInvoiceInfoResponseJson.data.err_msg === "请输入正确的快递单号"
      ) {
        throw new BadRequestError("정확한 운송장 번호를 입력해주세요");
      } else if (searchInvoiceInfoResponseJson.data.err_msg === "单号不存在") {
        throw new NotFoundError("운송장 번호가 존재하지 않습니다");
      } else {
        throw new InternalError(searchInvoiceInfoResponseJson.data.err_msg);
      }
    }

    const safeParseResult =
      await schema.SearchInvoiceInfoResponseTrackSchema.strict().safeParseAsync(
        searchInvoiceInfoResponseJson
      );
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        searchInvoiceInfoResponseJson,
      });
    }

    const events: TrackEvent[] = [];
    for (const event of searchInvoiceInfoResponseJson.data.list) {
      events.unshift(this.transformEvent(event));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(
    item: z.infer<
      typeof schema.SearchInvoiceInfoResponseTrackDataListItemSchema
    >
  ): TrackEvent {
    return {
      status: this.parseStatus(item.status_text),
      time: this.parseTime(item.time),
      location: null,
      contact: null,
      description: item.status ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(code: string): TrackEventStatus {
    switch (code) {
      case "at_pickup":
        return {
          code: TrackEventStatusCode.InformationReceived,
          name: "운송장 등록",
          carrierSpecificData: new Map(),
        };
      case "in_transit":
        return {
          code: TrackEventStatusCode.InTransit,
          name: "운송 중",
          carrierSpecificData: new Map(),
        };
      case "out_for_delivery":
        return {
          code: TrackEventStatusCode.OutForDelivery,
          name: "배송 예정",
          carrierSpecificData: new Map(),
        };
      case "delivered":
        return {
          code: TrackEventStatusCode.Delivered,
          name: "배송 완료",
          carrierSpecificData: new Map(),
        };
    }

    this.logger.warn("Unexpected status code", {
      code,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: code ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss", {
      zone: "UTC+9",
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

export { LTL };

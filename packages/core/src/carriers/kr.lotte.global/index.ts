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
import { InternalError, NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import * as schema from "./LotteGlobalAPISchemas";
import { type z } from "zod";

const carrierLogger = rootLogger.child({
  carrierId: "kr.lotte.global",
});

class LotteGlobal extends Carrier {
  readonly carrierId = "kr.lotte.global";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new LotteGlobalTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class LotteGlobalTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "https://www.lotteglogis.com/home/reservation/global/track_ajax",
      {
        method: "POST",
        headers: [
          ["Content-Type", "application/x-www-form-urlencoded; charset=UTF-8"],
        ],
        body: new URLSearchParams({ inv_no: this.trackingNumber }).toString(),
      }
    );

    const traceResponseJson: z.infer<typeof schema.TrackResponseSchema> =
      await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await schema.TrackResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    if (traceResponseJson.responseHeader.result === "error") {
      if (traceResponseJson.responseHeader.message.includes("does't exists")) {
        throw new NotFoundError(traceResponseJson.responseHeader.message);
      } else {
        this.logger.error("response error", {
          message: traceResponseJson.responseHeader.message,
        });
        throw new InternalError(traceResponseJson.responseHeader.message);
      }
    }

    if (traceResponseJson.trackingEvents === null) {
      throw new InternalError("trackingEvents === null");
    }

    const events: TrackEvent[] = [];
    for (const event of traceResponseJson.trackingEvents.trackingEvents) {
      events.push(this.transformEvent(event));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(
    event: z.infer<typeof schema.TrackResponseTrackingEventSchema>
  ): TrackEvent {
    return {
      status: this.parseStatus(event.description),
      time: this.parseTime(event.date, event.time),
      location: null,
      contact: null,
      description: event.description ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(description: string): TrackEventStatus {
    const textStatusMappingList: Array<[TrackEventStatusCode, string, string]> =
      [
        [TrackEventStatusCode.InTransit, "상품 발송", "상품을 발송"],
        [TrackEventStatusCode.InTransit, "해외창고 입고", "해외창고에 입고"],
        [TrackEventStatusCode.InTransit, "발송주문 접수", "발송주문 접수"],
        [TrackEventStatusCode.InTransit, "수입신고", "수입신고"],
        [TrackEventStatusCode.InTransit, "통관처리", "통관처리"],
        [TrackEventStatusCode.InTransit, "입고", "입고"],
        [TrackEventStatusCode.InTransit, "출고", "출고"],
        [TrackEventStatusCode.InTransit, "접수", "접수"],
        [TrackEventStatusCode.InTransit, "출고", "로 물품을 보냈"],
        [TrackEventStatusCode.InTransit, "입고", "도착"],
        [TrackEventStatusCode.InTransit, "배달 준비중", "배달 준비중"],
        [TrackEventStatusCode.Delivered, "배달 완료", "배달 완료"],
      ];

    for (const item of textStatusMappingList) {
      if (description.includes(item[2])) {
        return {
          code: item[0],
          name: item[1],
          carrierSpecificData: new Map(),
        };
      }
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

  private parseTime(date: string, time: string): DateTime | null {
    const result = DateTime.fromFormat(`${date} ${time}`, "yyyyMMdd HHmm", {
      zone: "UTC+9",
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

export { LotteGlobal };

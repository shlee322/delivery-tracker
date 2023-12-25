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
} from "../../core";
import { NotFoundError } from "../../core/errors";
import { rootLogger } from "../../logger";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import * as schema from "./YongmaLogisAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.yongmalogis",
});

class YongmaLogis extends Carrier {
  readonly carrierId = "kr.yongmalogis";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new YongmaLogisScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class YongmaLogisScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const selectDmTrc060QueryString = new URLSearchParams({
      ymd: "",
      conscd: "",
      seq: "",
      ordno: this.trackingNumber,
    }).toString();
    const selectDmTrc060Response = await this.upstreamFetcher.fetch(
      `https://eis.yongmalogis.co.kr/dm/dmtrc060/selectDmTrc060?${selectDmTrc060QueryString}`
    );
    const selectDmTrc060ResponseBodyText = await selectDmTrc060Response.text();
    this.logger.debug("selectDmTrc060ResponseBodyText", {
      selectDmTrc060ResponseBodyText,
    });

    if (selectDmTrc060ResponseBodyText === "") {
      throw new NotFoundError("현재 접수번호에 대한 정보를 찾지 못했습니다");
    }
    const selectDmTrc060ResponseJson: z.infer<
      typeof schema.SelectDmTrc060ResponseSchema
    > = JSON.parse(selectDmTrc060ResponseBodyText);

    const safeParseResult =
      await schema.SelectDmTrc060ResponseSchema.strict().safeParseAsync(
        selectDmTrc060ResponseJson
      );
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        selectDmTrc060ResponseJson,
      });
    }

    const selectDmTrc060StatusQueryString = new URLSearchParams({
      ymd: selectDmTrc060ResponseJson.ymd,
      conscd: selectDmTrc060ResponseJson.code,
      seq: selectDmTrc060ResponseJson.seqnum.toString(),
    }).toString();
    const selectDmTrc060StatusResponse = await this.upstreamFetcher.fetch(
      `https://eis.yongmalogis.co.kr/dm/dmtrc060/selectDmTrc060Status?${selectDmTrc060StatusQueryString}`
    );

    const selectDmTrc060StatusResponseJson: z.infer<
      typeof schema.SelectDmTrc060StatusResponseSchema
    > = await selectDmTrc060StatusResponse.json();
    this.logger.debug("selectDmTrc060StatusResponseJson", {
      selectDmTrc060StatusResponseJson,
    });

    const safeParseResult2 =
      await schema.SelectDmTrc060StatusResponseSchema.safeParseAsync(
        selectDmTrc060StatusResponseJson
      );
    if (!safeParseResult2.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult2.error,
        selectDmTrc060StatusResponseJson,
      });
    }

    const events: TrackEvent[] = [];
    for (const event of selectDmTrc060StatusResponseJson) {
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
    item: z.infer<typeof schema.SelectDmTrc060StatusResponseItemSchema>
  ): TrackEvent {
    return {
      status: this.parseStatus(item.state),
      time: this.parseTime(item.ymd),
      location: null,
      contact: null,
      description: item.sendstatus ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(stateText: string): TrackEventStatus {
    switch (stateText) {
      case "인수":
        return {
          code: TrackEventStatusCode.AtPickup,
          name: "인수",
          carrierSpecificData: new Map(),
        };
      case "Hub도착":
      case "배송DC":
        return {
          code: TrackEventStatusCode.InTransit,
          name: stateText,
          carrierSpecificData: new Map(),
        };
      case "배송중":
        return {
          code: TrackEventStatusCode.OutForDelivery,
          name: "배송중",
          carrierSpecificData: new Map(),
        };
      case "배송완료":
        return {
          code: TrackEventStatusCode.Delivered,
          name: "배송완료",
          carrierSpecificData: new Map(),
        };
    }

    this.logger.warn("Unexpected status code", {
      stateText,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: stateText ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string): DateTime | null {
    const polishedTime = time.replace(" :", ""); // 입력 예시: "2023-12-12 :"
    const result = DateTime.fromFormat(polishedTime, "yyyy-MM-dd", {
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

export { YongmaLogis };

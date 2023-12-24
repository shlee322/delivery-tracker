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
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import * as schema from "./CainiaoGlobalAPISchemas";
import { type z } from "zod";

const carrierLogger = rootLogger.child({
  carrierId: "cn.cainiao.global",
});

class CainiaoGlobal extends Carrier {
  readonly carrierId = "cn.cainiao.global";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new CainiaoGlobalTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class CainiaoGlobalTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      mailNos: this.trackingNumber,
      lang: "en-US",
      language: "en-US",
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://global.cainiao.com/global/detail.json?${queryString}`
    );

    const traceResponseJson: z.infer<typeof schema.GlobalDetailResponseSchema> =
      await response.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
    });

    const safeParseResult =
      await schema.GlobalDetailResponseSchema.strict().safeParseAsync(
        traceResponseJson
      );
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        traceResponseJson,
      });
    }

    if (
      traceResponseJson.module[0].mailNoSource === "EXTERNAL" &&
      traceResponseJson.module[0].detailList.length === 0
    ) {
      throw new NotFoundError();
    }

    const events: TrackEvent[] = [];
    for (const detail of traceResponseJson.module[0].detailList) {
      events.unshift(this.transformEvent(detail));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(
    detail: z.infer<typeof schema.GlobalDetailResponseModuleDetailSchema>
  ): TrackEvent {
    return {
      status: this.parseStatus(detail.actionCode),
      time: this.parseTime(detail.timeStr, detail.timeZone),
      location: null,
      contact: null,
      description: detail.desc ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(actionCode: string): TrackEventStatus {
    switch (actionCode) {
      case "GTMS_SIGNED":
        return {
          code: TrackEventStatusCode.Delivered,
          name: "Delivered",
          carrierSpecificData: new Map(),
        };
      case "GTMS_DO_DEPART":
        return {
          code: TrackEventStatusCode.OutForDelivery,
          name: "Out for delivery",
          carrierSpecificData: new Map(),
        };
      case "GTMS_SC_ARRIVE":
      case "GTMS_SC_DEPART":
      case "GTMS_ACCEPT":
      case "CC_IM_START":
      case "LH_ARRIVE":
      case "LH_DEPART":
      case "LH_HO_AIRLINE":
      case "CC_EX_SUCCESS":
      case "LH_HO_IN_SUCCESS":
      case "SC_OUTBOUND_SUCCESS":
      case "CW_OUTBOUND":
        return {
          code: TrackEventStatusCode.InTransit,
          name: "In Transit",
          carrierSpecificData: new Map(),
        };
    }

    this.logger.warn("Unexpected status code", {
      actionCode,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: actionCode,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string, timezone: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy-MM-dd HH:mm:ss", {
      zone: timezone.replace("GMT", "UTC"),
    });

    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        inputTimezone: timezone,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }
}

export { CainiaoGlobal };

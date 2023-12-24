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
import * as schema from "./PantosAPISchemas";
import { type z } from "zod";

const carrierLogger = rootLogger.child({
  carrierId: "kr.epantos",
});

class Pantos extends Carrier {
  readonly carrierId = "kr.epantos";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new PantosTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class PantosTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const trackingListResponse = await this.upstreamFetcher.fetch(
      "https://www.epantos.com/eCommerce/action/portal.TrackingPopup.retreiveTrackingList",
      {
        method: "POST",
        headers: [["Content-Type", "application/json"]],
        body: JSON.stringify({ quickNo: this.trackingNumber, locale: "ko" }),
      }
    );

    const trackingListResponseJson: z.infer<
      typeof schema.TrackingListResponseSchema
    > = await trackingListResponse.json();
    this.logger.debug("trackingListResponseJson", {
      trackingListResponseJson,
    });

    const trackingListResponseJsonSafeParseResult =
      await schema.TrackingListResponseSchema.strict().safeParseAsync(
        trackingListResponseJson
      );
    if (!trackingListResponseJsonSafeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: trackingListResponseJsonSafeParseResult.error,
        trackingListResponseJson,
      });
    }

    if (trackingListResponseJson.body.list.length < 1) {
      throw new NotFoundError();
    }

    const hblInfo = trackingListResponseJson.body.list[0];

    const trackingListDtlResponse = await this.upstreamFetcher.fetch(
      "https://www.epantos.com/eCommerce/action/portal.TrackingPopup.retreiveTrackingListDtl",
      {
        method: "POST",
        headers: [["Content-Type", "application/json"]],
        body: JSON.stringify({
          hblNo: hblInfo.hblNo,
          mblNo: hblInfo.mblNo,
          locale: "ko",
          expsBizTypeCd: hblInfo.expsBizTypeCd,
        }),
      }
    );

    const trackingListDtlResponseJson: z.infer<
      typeof schema.TrackingListDtlResponseSchema
    > = await trackingListDtlResponse.json();
    this.logger.debug("trackingListDtlResponseJson", {
      trackingListDtlResponseJson,
    });

    const trackingListDtlResponseJsonSafeParseResult =
      await schema.TrackingListDtlResponseSchema.strict().safeParseAsync(
        trackingListDtlResponseJson
      );

    if (!trackingListDtlResponseJsonSafeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: trackingListDtlResponseJsonSafeParseResult.error,
        trackingListDtlResponseJson,
      });
    }

    const events: TrackEvent[] = [];
    for (const event of trackingListDtlResponseJson.body) {
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
    event: z.infer<typeof schema.TrackingListDtlResponseBodyItemSchema>
  ): TrackEvent {
    return {
      status: this.parseStatus(event.evntCd),
      time: this.parseTime(event.evntDt2, event.evntLocNm),
      location: null,
      contact: null,
      description: event.evntDesc ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatus(evntCd: string): TrackEventStatus {
    switch (evntCd) {
      case "DLI":
        return {
          code: TrackEventStatusCode.Delivered,
          name: "Delivered",
          carrierSpecificData: new Map(),
        };
      case "FST":
        return {
          code: TrackEventStatusCode.OutForDelivery,
          name: "Out for delivery",
          carrierSpecificData: new Map(),
        };
      case "PKU":
        return {
          code: TrackEventStatusCode.AtPickup,
          name: "Pick Up",
          carrierSpecificData: new Map(),
        };
      case "DCCC":
      case "DWHO":
      case "DWHI":
      case "ARR":
      case "DEP":
      case "LWHO":
      case "LWHI":
        return {
          code: TrackEventStatusCode.InTransit,
          name: "In Transit",
          carrierSpecificData: new Map(),
        };
    }

    this.logger.warn("Unexpected status code", {
      evntCd,
    });

    return {
      code: TrackEventStatusCode.Unknown,
      name: evntCd,
      carrierSpecificData: new Map(),
    };
  }

  private parseTime(time: string, location: string): DateTime | null {
    const result = DateTime.fromFormat(time, "yyyy.MM.dd HH:mm", {
      zone: "UTC+9",
    });

    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        inputLocation: location,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }
}

export { Pantos };

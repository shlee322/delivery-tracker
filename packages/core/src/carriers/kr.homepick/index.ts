import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { BadRequestError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import {
  type DeliveryResponse,
  type DeliveryResponseDataDeliveryOrderStatusHistoryListItem,
  DeliveryResponseSchema,
} from "./HomepickAPISchemas";

const carrierLogger = rootLogger.child({
  carrierId: "kr.homepick",
});

class Homepick extends Carrier {
  readonly carrierId = "kr.homepick";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new HomepickTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class HomepickTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      keyword: this.trackingNumber,
    }).toString();

    const response = await this.upstreamFetcher.fetch(
      `https://www.homepick.com/user/api/delivery/universalInquiry?${queryString}`
    );

    const universalInquiryResponse = await response.json();

    if (universalInquiryResponse.success === false) {
      throw new BadRequestError(universalInquiryResponse.message);
    }

    const orderBoxId = universalInquiryResponse.data;
    const deliveryResponse = await this.upstreamFetcher.fetch(
      `https://www.homepick.com/user/api/delivery/${orderBoxId}`
    );

    const deliveryResponseBody: DeliveryResponse =
      await deliveryResponse.json();
    this.logger.debug("deliveryResponseBody", {
      deliveryResponseBody,
    });

    const safeParseResult =
      await DeliveryResponseSchema.strict().safeParseAsync(
        deliveryResponseBody
      );

    if (!safeParseResult.success) {
      this.logger.warn("deliveryResponseBody parse failed (strict)", {
        error: safeParseResult.error,
        deliveryResponseBody,
      });
    }

    const events: TrackEvent[] = [];
    for (const event of deliveryResponseBody.data.delivery
      .orderStatusHistoryList) {
      events.unshift(this.parseEvent(event));
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

  private parseEvent(
    event: DeliveryResponseDataDeliveryOrderStatusHistoryListItem
  ): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(event.trackingStatus),
        name: event.tmsStatusName ?? event.trackingStatusName ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(event.statusDateTime),
      location: {
        name: event.location ?? null,
        countryCode: "KR",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: event.contents ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "RECEIVED":
        return TrackEventStatusCode.InformationReceived;
      case "TERMINAL_IN":
        return TrackEventStatusCode.InTransit;
      case "MOVING":
        return TrackEventStatusCode.InTransit;
      case "DLV_START":
        return TrackEventStatusCode.OutForDelivery;
      case "COMPLETED":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      return null;
    }

    const result = DateTime.fromISO(time, { setZone: true });

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

export { Homepick };

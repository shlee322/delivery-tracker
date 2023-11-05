import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { BadRequestError, NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { Cookie } from "tough-cookie";

const carrierLogger = rootLogger.child({
  carrierId: "us.ups",
});

class UPS extends Carrier {
  readonly carrierId = "us.ups";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new UPSTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class UPSTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const trackPageResponse = await this.upstreamFetcher.fetch(
      `https://www.ups.com/track?track=yes&trackNums=${encodeURIComponent(
        this.trackingNumber
      )}&loc=en_US`
    );

    const cookies = [];
    for (const [name, value] of trackPageResponse.headers.entries()) {
      if (name !== "set-cookie") continue;
      const cookie = Cookie.parse(value);
      if (cookie === null || cookie === undefined) continue;
      if (cookie.domain !== "ups.com") continue;
      cookies.push(cookie);
    }

    const xsrfToken =
      cookies.find((cookie) => cookie.key === "X-XSRF-TOKEN-ST")?.value ?? null;

    const headers: Array<[string, string]> = [
      ["Accept", "application/json"],
      ["Content-Type", "application/json"],
      ["Origin", "https://www.ups.com"],
      [
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      ],
      ["Cookie", cookies.map((cookie) => cookie.cookieString()).join("; ")],
    ];

    if (xsrfToken !== null) {
      headers.push(["X-Xsrf-Token", xsrfToken]);
    }
    const traceResponse = await this.upstreamFetcher.fetch(
      "https://webapis.ups.com/track/api/Track/GetStatus?loc=en_US",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          Locale: "en_US",
          TrackingNumber: [this.trackingNumber],
        }),
      }
    );

    const traceResponseJson = await traceResponse.json();
    this.logger.debug("traceResponseJson", {
      traceResponseJson,
      traceResponseStatus: traceResponse.status,
    });

    if (traceResponseJson?.statusCode === "402") {
      throw new BadRequestError();
    }

    const trackDetails = traceResponseJson.trackDetails[0];
    if (trackDetails.errorCode === "504") {
      throw new NotFoundError();
    }

    const events: TrackEvent[] = [];
    for (const activity of trackDetails.shipmentProgressActivities ?? []) {
      events.unshift(this.transformEvent(activity));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private transformEvent(activity: any): TrackEvent {
    return {
      status: {
        code: this.transformStatusCode(activity.milestoneName?.nameKey ?? null),
        name: activity.milestoneName?.name ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(
        activity.gmtDate,
        activity.gmtTime,
        activity.gmtOffset
      ),
      location: null,
      contact: null,
      description:
        activity?.activityScan ?? activity.milestoneName?.name ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private transformStatusCode(nameKey: string | null): TrackEventStatusCode {
    if (nameKey === null) {
      this.logger.warn("nameKey null");
      return TrackEventStatusCode.Unknown;
    }

    switch (nameKey) {
      case "cms.stapp.orderReceived":
        return TrackEventStatusCode.InformationReceived;
      case "cms.stapp.outForDelivery":
        return TrackEventStatusCode.OutForDelivery;
      case "cms.stapp.inTransit":
        return TrackEventStatusCode.InTransit;
      case "cms.stapp.delivered":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected nameKey", {
      nameKey,
    });
    return TrackEventStatusCode.Unknown;
  }

  private parseTime(
    gmtDate: string | null,
    gmtTime: string | null,
    gmtOffset: string | null
  ): DateTime | null {
    if (gmtDate === null || gmtTime === null || gmtOffset === null) {
      this.logger.warn("gmtDate or gmtTime or gmtOffset null", {
        gmtDate,
        gmtTime,
        gmtOffset,
      });
      return null;
    }

    const result = DateTime.fromFormat(
      `${gmtDate} ${gmtTime}`,
      "yyyyMMdd HH:mm:ss",
      {
        setZone: true,
      }
    ).setZone(`UTC${gmtOffset}`);

    if (!result.isValid) {
      this.logger.warn("time parse error", {
        gmtDate,
        gmtTime,
        gmtOffset,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    return result;
  }
}

export { UPS };

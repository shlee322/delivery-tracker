import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { InternalError, NotFoundError } from "../../core/errors";
import { type z } from "zod";
import { DateTime } from "luxon";
import {
  CwayDetailResponseSchema,
  type CwayLogListResponseRowSchema,
  CwayLogListResponseSchema,
} from "./CwayAPISchemas";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.cway",
});

class Cway extends Carrier {
  readonly carrierId = "kr.cway";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new CwayTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class CwayTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const detailResponse = await fetch("http://cway.hagoto.com/where/details", {
      method: "POST",
      headers: [
        ["content-type", "application/x-www-form-urlencoded; charset=UTF-8"],
      ],
      body: new URLSearchParams({
        hblNo: this.trackingNumber,
      }).toString(),
    });

    const detailResponseBody: z.infer<typeof CwayDetailResponseSchema> =
      await detailResponse.json();
    this.logger.debug("trackingResponse - detailResponseBody", {
      detailResponseBody,
    });
    await this.safeParseLog(CwayDetailResponseSchema, detailResponseBody);

    if (detailResponseBody.code == 500) {
      throw new NotFoundError();
    }

    if (detailResponseBody.data === null) {
      throw new InternalError();
    }

    const logListResponse = await fetch(
      "http://cway.hagoto.com/where/hbl/logList",
      {
        method: "POST",
        headers: [["content-type", "application/x-www-form-urlencoded"]],
        body: new URLSearchParams({
          hblNo: this.trackingNumber,
          pageNum: "NaN",
          isAsc: "asc",
        }).toString(),
      }
    );

    const logListResponseBody: z.infer<typeof CwayLogListResponseSchema> =
      await logListResponse.json();
    this.logger.debug("trackingResponse - logListResponseBody", {
      logListResponseBody,
    });

    await this.safeParseLog(CwayLogListResponseSchema, logListResponseBody);

    const events =
      logListResponseBody.rows.map((log) => this.transformEvent(log)) ?? [];

    return {
      events,
      sender: null,
      recipient: {
        name: detailResponseBody.data.receiver,
        location: null,
        phoneNumber: null,
        carrierSpecificData: new Map([]),
      },
      carrierSpecificData: new Map([]),
    };
  }

  private async safeParseLog(schema: any, data: any): Promise<void> {
    const safeParseResult = await schema.strict().safeParseAsync(data);
    if (!safeParseResult.success) {
      this.logger.warn("response body parse failed (strict)", {
        error: safeParseResult.error,
        data,
      });
    }
  }

  private transformEvent(
    log: z.infer<typeof CwayLogListResponseRowSchema>
  ): TrackEvent {
    return {
      status: {
        code: this.transformStatusCode(log.logStatus),
        name: log.logStatus,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(log.logTime),
      location: {
        name: log.logDetail.split(" ").at(0) ?? null,
        countryCode: null,
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: log.logDetail ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private transformStatusCode(logStatus: string): TrackEventStatusCode {
    switch (logStatus) {
      case "집하":
        return TrackEventStatusCode.InTransit;
      case "선적":
        return TrackEventStatusCode.InTransit;
      case "세관지정 장치장 반입":
        return TrackEventStatusCode.InTransit;
      case "수입통관 진행중":
        return TrackEventStatusCode.InTransit;
      case "세관지정 장치장 반출":
        return TrackEventStatusCode.InTransit;
      case "수입통관 완료":
        return TrackEventStatusCode.InTransit;
      case "집화처리":
        return TrackEventStatusCode.InTransit;
      case "간선하차":
        return TrackEventStatusCode.InTransit;
      case "간선상차":
        return TrackEventStatusCode.InTransit;
      case "배달출발":
        return TrackEventStatusCode.OutForDelivery;
      case "배달완료":
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("parseStatusCode Unknown", {
      logStatus,
    });
    return TrackEventStatusCode.Unknown;
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
}

export { Cway };

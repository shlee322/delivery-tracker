import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { NotFoundError } from "../../core/errors";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "kr.actcore.ocean-inbound",
});

class ActcoreOceanInbound extends Carrier {
  readonly carrierId = "kr.actcore.ocean-inbound";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new ActcoreTrackOceanInboundScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class ActcoreTrackOceanInboundScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const tracingObjResponse = await this.upstreamFetcher.fetch(
      "http://exp.actcore.com/common/selectTracingObjByLogin.do",
      {
        method: "POST",
        headers: [
          ["content-type", "application/x-www-form-urlencoded; charset=UTF-8"],
        ],
        body: new URLSearchParams({
          params: JSON.stringify({
            DeliveryCode: "",
            HBLNO: this.trackingNumber,
            PONO: "",
            REFNO: "",
            tableTag: "OI",
            tableName: "WTEDOI_STATUS",
            tableNameHbl: "WTEDOI_HBL",
            tableCSNameHbl: "TEDOI_HBL",
            tableNameAdd: "TEDOI_HBL_Additional",
            VesselName: "Y",
            langCode: "KOR",
            fwdCode: "kact",
          }),
        }).toString(),
      }
    );

    const tracingObjResponseBody = await tracingObjResponse.json();
    this.logger.debug("tracingObjResponseBody", {
      tracingObjResponseBody,
    });

    if (tracingObjResponseBody.data === "null") {
      throw new NotFoundError("H.B/L No does not exist");
    }

    const tracingListResponse = await this.upstreamFetcher.fetch(
      "http://exp.actcore.com/common/selectTracingListByLogin.do",
      {
        method: "POST",
        headers: [
          ["content-type", "application/x-www-form-urlencoded; charset=UTF-8"],
        ],
        body: new URLSearchParams({
          DeliveryCode: "",
          HBLNO: tracingObjResponseBody.data.HBLNO,
          PONO: "",
          REFNO: tracingObjResponseBody.data.REFNO,
          tableTag: "OI",
          tableName: "WTEDOI_STATUS",
          tableNameHbl: "WTEDOI_HBL",
          tableCSNameHbl: "TEDOI_HBL",
          tableNameAdd: "TEDOI_HBL_Additional",
          VesselName: "Y",
          langCode: "KOR",
          fwdCode: "kact",
          _search: "false",
          nd: new Date().getTime().toString(),
          rows: "30",
          page: "1",
          sidx: "CONFIRMDATE ASC, CONFIRMTIME ASC, STATUSCODE",
          sord: "asc",
        }).toString(),
      }
    );

    const tracingListBody = await tracingListResponse.json();
    this.logger.debug("tracingListBody", {
      tracingListBody,
    });

    const events: TrackEvent[] = [];
    if (tracingListBody.records >= 30) {
      this.logger.warn("records count overflow", {
        count: tracingListBody.records,
      });
    }

    for (const row of tracingListBody.rows) {
      events.push(this.parseEvent(row));
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

  private parseEvent(row: any): TrackEvent {
    return {
      status: {
        code: this.parseStatusCode(row.STATUSCODE),
        name: row.STATUSNAME ?? null,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(row.CONFIRMDATE, row.CONFIRMTIME),
      location: null,
      contact: null,
      description: row.DESCRIPTION ?? null,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(status: string | null): TrackEventStatusCode {
    switch (status) {
      case "HTA": // 오더접수
      case "HTB": // 픽업
      case "HTD": // 출항
      case "HTE": // 입항
      case "HTF": // 반입완료
      case "HTF_O": // 반출완료
      case "HTG": // 통관진행, 통관접수
      case "HTH": // 수입신고수리, 통관완료
      case "HTI": // 배송접수
        return TrackEventStatusCode.InTransit;
      case "HTJ": // 배송완료
        return TrackEventStatusCode.Delivered;
    }

    this.logger.warn("Unexpected status code", {
      status,
    });

    return TrackEventStatusCode.Unknown;
  }

  private parseTime(date: string, time: string): DateTime | null {
    const result = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", {
      zone: "Asia/Seoul",
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

export { ActcoreOceanInbound };

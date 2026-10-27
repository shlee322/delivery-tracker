import { type Logger } from "winston";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/errors";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "jp.yamato",
});

class Yamato extends Carrier {
  readonly carrierId = "jp.yamato";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new YamatoTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class YamatoTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const response = await this.upstreamFetcher.fetch(
      "https://toi.kuronekoyamato.co.jp/cgi-bin/tneko",
      {
        method: "POST",
        headers: [["content-type", "application/x-www-form-urlencoded"]],
        body: new URLSearchParams({
          category: "0",
          number01: this.trackingNumber,
        }).toString(),
      }
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const invoice = document.querySelector(".parts-tracking-invoice-block");

    if (invoice === null) {
      throw new InternalError("invoice DOM Not Found.");
    }

    const errorDOM = invoice.querySelector(
      ".tracking-invoice-block-state.is-urgent-red"
    );
    if (errorDOM !== null) {
      const message =
        errorDOM.textContent?.replace(/\s+/g, " ")?.trim() ?? "Unknown Error";
      if (message.includes("伝票番号誤り")) {
        throw new NotFoundError(message);
      }
      throw new BadRequestError(message);
    }

    const eventDOMs =
      invoice?.querySelectorAll(".tracking-invoice-block-detail > ol > li") ??
      [];

    const events: TrackEvent[] = [];
    for (const eventDOM of eventDOMs) {
      events.push(this.parseEvent(eventDOM));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(tr: Element): TrackEvent {
    const status =
      tr.querySelector(".item")?.textContent?.replace(/\s+/g, " ")?.trim() ??
      null;
    const time =
      tr.querySelector(".date")?.textContent?.replace(/\s+/g, " ")?.trim() ??
      null;
    const location =
      tr.querySelector(".name")?.textContent?.replace(/\s+/g, " ")?.trim() ??
      null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time),
      location: {
        name: location,
        countryCode: "JP",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: `${location ?? ""} - ${status ?? ""}`,
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(text: string | null): TrackEventStatusCode {
    const code = mapYamatoStatus(text);
    if (code === TrackEventStatusCode.Unknown) {
      this.logger.warn("Unexpected status code", {
        text,
      });
    }
    return code;
  }

  private parseTime(time: string | null): DateTime | null {
    if (time === null) {
      return null;
    }
    let result = DateTime.fromFormat(time, "MM月dd日 HH:mm", {
      zone: "Asia/Tokyo",
    });
    if (!result.isValid) {
      result = DateTime.fromFormat(time, "MM月dd日", {
        zone: "Asia/Tokyo",
      });
    }
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    const now = DateTime.now().setZone("Asia/Tokyo");
    const estimatedTime = result.set({
      year: now.year,
    });
    if (estimatedTime > now) {
      return estimatedTime.minus({ years: 1 });
    } else {
      return estimatedTime;
    }
  }
}

function mapYamatoStatus(text: string | null): TrackEventStatusCode {
  switch (text) {
    case "出荷指示": // Indication for shipment
      return TrackEventStatusCode.InformationReceived;
    case "荷物受付": // Shipment Accepted
      return TrackEventStatusCode.AtPickup;
    case "発送済み": // Shipped Out
    case "輸送中": // In Transit
    case "作業店通過": // Passed through a branch
    case "輸送経路修正": // Route corrected
    case "配達店到着": // Arrived at the delivering branch
    case "配達予定": // Scheduled for delivery
    case "転送": // Forwarded
      return TrackEventStatusCode.InTransit;
    case "配達中": // Out for delivery
    case "投函予定": // Scheduled to be put in the mailbox
      return TrackEventStatusCode.OutForDelivery;
    case "お客様引渡完了": // Handed over to the customer (at store)
      return TrackEventStatusCode.Delivered;
    case "保管中（ご指定店）": // Held at the designated store
    case "配達担当店保管中": // Held at the delivering branch
    case "ご来店予定": // Customer will pick it up at the store
      return TrackEventStatusCode.AvailableForPickup;
    case "調査中": // Under investigation
    case "返品": // Returned to sender
      return TrackEventStatusCode.Exception;
  }
  const status = text ?? "";
  if (status.startsWith("配達完了") || status.startsWith("投函完了")) {
    // 配達完了 / 配達完了（宅配ボックス） / 投函完了 (put in the mailbox)
    return TrackEventStatusCode.Delivered;
  }
  if (status.startsWith("持戻")) {
    // Brought back, e.g. 持戻（ご不在） / 持戻（ポスト投函不可）
    return TrackEventStatusCode.AttemptFail;
  }
  if (
    status.startsWith("依頼受付") ||
    status.startsWith("配達日・時間帯指定") ||
    status.startsWith("日・時間帯変更")
  ) {
    // Requests from the recipient, e.g. 依頼受付（再配達） / 配達日・時間帯指定（保管中）
    return TrackEventStatusCode.InTransit;
  }

  return TrackEventStatusCode.Unknown;
}

export { Yamato, mapYamatoStatus };

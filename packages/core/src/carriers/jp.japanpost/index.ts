import { type Logger } from "winston";
import { JSDOM } from "jsdom";
import {
  Carrier,
  type CarrierTrackInput,
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
} from "../../core";
import { rootLogger } from "../../logger";
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { BadRequestError, NotFoundError } from "../../core/errors";

const carrierLogger = rootLogger.child({
  carrierId: "jp.japanpost",
});

/**
 * Japan Post (日本郵便). One lookup covers ゆうパック, レターパック, ゆうパケット,
 * クリックポスト, 書留 and international mail handled by Japan Post.
 */
class JapanPost extends Carrier {
  readonly carrierId = "jp.japanpost";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new JapanPostTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class JapanPostTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    const queryString = new URLSearchParams({
      reqCodeNo1: this.trackingNumber.replace(/-/g, ""),
      searchKind: "S002",
      locale: "ja",
    }).toString();
    const response = await this.upstreamFetcher.fetch(
      `https://trackings.post.japanpost.jp/services/srv/search/direct?${queryString}`
    );
    const traceResponseHtmlText = await response.text();
    this.logger.debug("traceResponseHtmlText", {
      html: traceResponseHtmlText,
    });

    const dom = new JSDOM(traceResponseHtmlText);
    const { document } = dom.window;

    const historyTable = document.querySelector('table[summary="履歴情報"]');
    if (historyTable === null) {
      const message =
        document
          .querySelector('table[summary="照会結果"] td.txt_l')
          ?.textContent?.replace(/\s+/g, " ")
          ?.trim() ?? null;
      if (message === null || message.includes("見つかりません")) {
        throw new NotFoundError(message ?? undefined);
      }
      throw new BadRequestError(message);
    }

    // Each event spans two rows: [date, status, detail, office, prefecture] and [postal code].
    const events: TrackEvent[] = [];
    for (const tr of historyTable.querySelectorAll("tr")) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 5) {
        continue;
      }
      events.push(this.parseEvent(tds));
    }

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private parseEvent(tds: NodeListOf<HTMLTableCellElement>): TrackEvent {
    const text = (index: number): string | null => {
      const value = tds[index].textContent?.replace(/\s+/g, " ")?.trim();
      return value === undefined || value === "" ? null : value;
    };
    const time = text(0);
    const status = text(1);
    const detail = text(2);
    const office = text(3);
    const prefecture = text(4);

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time),
      location: {
        name: office,
        countryCode: "JP",
        postalCode: null,
        carrierSpecificData: new Map(),
      },
      contact: null,
      description: [office, status, detail, prefecture]
        .filter((it) => it !== null)
        .join(" - "),
      carrierSpecificData: new Map(),
    };
  }

  private parseStatusCode(text: string | null): TrackEventStatusCode {
    const code = mapJapanPostStatus(text);
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
    let result = DateTime.fromFormat(time, "yyyy/MM/dd HH:mm", {
      zone: "Asia/Tokyo",
    });
    if (!result.isValid) {
      // Some events have a date only (e.g. 保管).
      result = DateTime.fromFormat(time, "yyyy/MM/dd", { zone: "Asia/Tokyo" });
    }
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
    }
    return result;
  }
}

function mapJapanPostStatus(text: string | null): TrackEventStatusCode {
  const status = text ?? "";
  const has = (...keywords: string[]): boolean =>
    keywords.some((it) => status.includes(it));

  // Order matters: e.g. お届け先休日等のため保管 is not delivered, 保管期間延長受付 is a hold.
  if (has("お届け済み", "お渡し")) {
    // お届け先にお届け済み / 窓口でお渡し
    return TrackEventStatusCode.Delivered;
  }
  if (has("返送", "返還", "調査", "取止め")) {
    // 差出人に返送 / 調査中 / 輸入取止め
    return TrackEventStatusCode.Exception;
  }
  if (has("不在", "持ち戻り")) {
    // ご不在のため持ち戻り
    return TrackEventStatusCode.AttemptFail;
  }
  if (has("持ち出し")) {
    // 持ち出し中
    return TrackEventStatusCode.OutForDelivery;
  }
  if (has("保管", "入庫", "引渡")) {
    // 保管 / 私書箱保管 / お届け先休日等のため保管 / 保管期間延長受付 /
    // はこぽす等に入庫 / コンビニエンスストア等に引渡
    return TrackEventStatusCode.AvailableForPickup;
  }
  if (has("引受")) {
    return TrackEventStatusCode.AtPickup;
  }
  if (
    has(
      "到着",
      "通過",
      "発送",
      "中継",
      "転送",
      "送付",
      "通関",
      "保税",
      "税関",
      "検疫",
      "申告",
      "受付"
    )
  ) {
    // 到着 / 通過 / 国際交換局から発送 / 中継 / 転送 / 最寄局・最寄店送付 / 通関手続中 /
    // 保税運送中 / 税関から受領 / 植物検疫中 / 輸出申告手続中 / 配達希望受付
    return TrackEventStatusCode.InTransit;
  }

  return TrackEventStatusCode.Unknown;
}

export { JapanPost, mapJapanPostStatus };

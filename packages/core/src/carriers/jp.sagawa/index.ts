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
import { DateTime } from "luxon";
import { type CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";

const carrierLogger = rootLogger.child({
  carrierId: "jp.sagawa",
});

// glowb fork: 2026-09-30 사고 이후 구 조회 화면(k2k.sagawa-exp.co.jp)이 403 으로 닫히고
// 공개 조회 화면이 e-customer.sagawa-exp.co.jp/k2k (Next.js) 로 옮겨졌다.
// 새 화면은 Server Action("searchPackages")으로 조회하며, 그 action id 는 사가와 배포마다 바뀔 수 있어
// 공개 페이지 스크립트에서 찾아 캐시하고, 조회가 실패하면 한 번 다시 찾는다.
const BASE_URL = "https://e-customer.sagawa-exp.co.jp";
const PAGE_URL = `${BASE_URL}/k2k`;
const ACTION_NAME = "searchPackages";
const ACTION_ID_TTL_MILLIS = 6 * 60 * 60 * 1000;
const FORM_FIELD = "_1_tracking_number";
const FORM_FIELD_COUNT = 10;
const ROUTER_STATE_TREE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C20%5D";

interface SagawaHistory {
  status?: string;
  date?: string;
  office?: string;
}

interface SagawaResult {
  trackingNumber?: string;
  status?: string;
  messageLines?: string[];
  shippedDate?: string;
  history?: SagawaHistory[];
}

interface SagawaSearchResponse {
  ok?: boolean;
  results?: SagawaResult[];
}

let cachedActionId: { id: string; fetchedAt: number } | null = null;

class Sagawa extends Carrier {
  readonly carrierId = "jp.sagawa";

  public async track(input: CarrierTrackInput): Promise<TrackInfo> {
    return await new SagawaTrackScraper(
      this.upstreamFetcher,
      input.trackingNumber
    ).track();
  }
}

class SagawaTrackScraper {
  private readonly logger: Logger;

  constructor(
    readonly upstreamFetcher: CarrierUpstreamFetcher,
    readonly trackingNumber: string
  ) {
    this.logger = carrierLogger.child({ trackingNumber });
  }

  public async track(): Promise<TrackInfo> {
    let response = await this.search(await this.getActionId(false));
    if (response === null) {
      // action id 가 바뀌었을 수 있다 → 다시 찾아 한 번만 재시도
      response = await this.search(await this.getActionId(true));
    }
    if (response === null) {
      throw new InternalError();
    }

    const result =
      response.results?.find(
        (it) => it.trackingNumber === this.trackingNumber
      ) ?? response.results?.[0];
    if (result === undefined || this.isNotFound(result)) {
      throw new NotFoundError(
        result?.messageLines?.join(" ") ??
          "お荷物データが登録されておりません。"
      );
    }

    const startDate = this.parseStartDate(result.shippedDate ?? null);
    const events: TrackEvent[] = (result.history ?? []).map((it) =>
      this.parseEvent(it, startDate)
    );

    return {
      events,
      sender: null,
      recipient: null,
      carrierSpecificData: new Map(),
    };
  }

  private async getActionId(forceRefresh: boolean): Promise<string> {
    const now = Date.now();
    if (
      !forceRefresh &&
      cachedActionId !== null &&
      now - cachedActionId.fetchedAt < ACTION_ID_TTL_MILLIS
    ) {
      return cachedActionId.id;
    }

    const pageResponse = await this.upstreamFetcher.fetch(PAGE_URL);
    if (!pageResponse.ok) {
      this.logger.warn("page fetch failed", { status: pageResponse.status });
      throw new InternalError();
    }
    const html = await pageResponse.text();
    const scriptPaths = [
      ...new Set(
        Array.from(
          html.matchAll(/\/k2k\/_next\/static\/chunks\/[A-Za-z0-9_.-]+\.js/g),
          (m) => m[0]
        )
      ),
    ];

    const pattern = new RegExp(
      `createServerReference\\)\\("([0-9a-f]{40,})",[^)]*?"${ACTION_NAME}"\\)`
    );
    for (const path of scriptPaths) {
      const scriptResponse = await this.upstreamFetcher.fetch(
        `${BASE_URL}${path}`
      );
      if (!scriptResponse.ok) {
        continue;
      }
      const match = (await scriptResponse.text()).match(pattern);
      if (match !== null) {
        cachedActionId = { id: match[1], fetchedAt: now };
        return match[1];
      }
    }

    this.logger.warn("server action id not found", {
      scripts: scriptPaths.length,
    });
    throw new InternalError();
  }

  /**
   * 조회 결과를 반환한다. action id 불일치 등으로 결과를 해석할 수 없으면 null.
   */
  private async search(actionId: string): Promise<SagawaSearchResponse | null> {
    const form = new FormData();
    form.append(FORM_FIELD, this.trackingNumber);
    for (let i = 1; i < FORM_FIELD_COUNT; i++) {
      form.append(FORM_FIELD, "");
    }
    form.append("0", '[null,"$K1"]');

    const response = await this.upstreamFetcher.fetch(PAGE_URL, {
      method: "POST",
      headers: [
        ["accept", "text/x-component"],
        ["next-action", actionId],
        ["next-router-state-tree", ROUTER_STATE_TREE],
      ],
      body: form,
    });
    const text = await response.text();
    this.logger.debug("searchResponseText", { status: response.status, text });

    if (!response.ok) {
      this.logger.warn("search failed", { status: response.status });
      return null;
    }
    return parseSearchResponse(text);
  }

  private isNotFound(result: SagawaResult): boolean {
    const message = (result.messageLines ?? []).join("");
    return (
      (result.status ?? "").includes("該当なし") ||
      message.includes("登録されておりません") ||
      (result.history ?? []).length === 0
    );
  }

  private parseStartDate(text: string | null): DateTime {
    const match = text?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) ?? null;
    if (match === null) {
      return DateTime.now().setZone("Asia/Tokyo");
    }
    return DateTime.fromObject(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      },
      { zone: "Asia/Tokyo" }
    );
  }

  private parseEvent(history: SagawaHistory, startDate: DateTime): TrackEvent {
    const status = history.status?.replace(/\s+/g, " ")?.trim() ?? null;
    const time = history.date?.replace(/\s+/g, " ")?.trim() ?? null;
    const location = history.office?.replace(/\s+/g, " ")?.trim() ?? null;

    return {
      status: {
        code: this.parseStatusCode(status),
        name: status,
        carrierSpecificData: new Map(),
      },
      time: this.parseTime(time, startDate),
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
    const code = mapSagawaStatus(text);
    if (code === TrackEventStatusCode.Unknown) {
      this.logger.warn("Unexpected status code", {
        text,
      });
    }
    return code;
  }

  private parseTime(time: string | null, startDate: DateTime): DateTime | null {
    if (time === null) {
      return null;
    }
    const result = DateTime.fromFormat(time, "MM/dd HH:mm", {
      zone: "Asia/Tokyo",
    });
    if (!result.isValid) {
      this.logger.warn("time parse error", {
        inputTime: time,
        invalidReason: result.invalidReason,
      });
      return result;
    }

    // 연도가 없다. 출하일(없으면 오늘) 연도로 두고, 출하일보다 앞서면 다음 해(연말 출하→연초 배달),
    // 그래도 미래면 전년도로 본다.
    let estimatedTime = result.set({ year: startDate.year });
    if (estimatedTime < startDate.minus({ days: 1 })) {
      estimatedTime = estimatedTime.plus({ years: 1 });
    }
    const now = DateTime.now().setZone("Asia/Tokyo");
    if (estimatedTime > now.plus({ days: 1 })) {
      estimatedTime = estimatedTime.minus({ years: 1 });
    }
    return estimatedTime;
  }
}

/**
 * React Server Components 응답(text/x-component)에서 조회 결과 JSON 을 꺼낸다.
 * 각 줄이 `<id>:<json>` 형태이며 그중 `results` 를 가진 객체가 조회 결과다.
 */
function parseSearchResponse(text: string): SagawaSearchResponse | null {
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const payload = line.slice(separator + 1);
    if (!payload.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as SagawaSearchResponse;
      if (Array.isArray(parsed.results)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function mapSagawaStatus(text: string | null): TrackEventStatusCode {
  const status = text?.replace(/^[↓⇒→\s]+/, "") ?? "";
  if (status === "集荷" || status === "発送準備中") {
    return TrackEventStatusCode.AtPickup;
  }
  if (status === "輸送中") {
    return TrackEventStatusCode.InTransit;
  }
  if (status === "配達中") {
    return TrackEventStatusCode.OutForDelivery;
  }
  if (status.startsWith("配達完了")) {
    // 配達完了 / 配達完了（宅配BOX）
    return TrackEventStatusCode.Delivered;
  }
  if (status.includes("持戻") || status.includes("不在")) {
    // ↓持戻り / ↓ご不在
    return TrackEventStatusCode.AttemptFail;
  }
  if (status.includes("保管") || status === "営業所受取") {
    // ↓保管中 / ↓営業所受取 (held at the office for pickup; ⇒配達完了 follows on pickup)
    return TrackEventStatusCode.AvailableForPickup;
  }
  if (
    status.includes("調査") ||
    status.includes("返品") ||
    status.includes("返送")
  ) {
    return TrackEventStatusCode.Exception;
  }

  return TrackEventStatusCode.Unknown;
}

export { Sagawa, parseSearchResponse, mapSagawaStatus };

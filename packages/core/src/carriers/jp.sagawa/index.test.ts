import { describe, expect, it, beforeEach } from "@jest/globals";
import { Sagawa, mapSagawaStatus, parseSearchResponse } from ".";
import { CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { TrackEventStatusCode } from "../../core";
import { NotFoundError } from "../../core/errors";

const ACTION_ID = "60e3b76ba7f1d28cf3c3fa01680217528f16cd1984";
const NEW_ACTION_ID = "7a11e2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4";

const pageHtml = (): string =>
  '<html><script src="/k2k/_next/static/chunks/aaa.js"></script>' +
  '<script src="/k2k/_next/static/chunks/bbb.js"></script></html>';

const chunk = (id: string): string =>
  `let s=(0,n.createServerReference)("${id}",n.callServer,void 0,n.findSourceMapURL,"searchPackages"),l="x";`;

// 2026-10-27 브라우저로 받은 실제 응답(360211174820, 사무소 연락처만 포함)
const deliveredResponse = (trackingNumber: string): string =>
  '0:{"a":"$@1","q":"","i":false,"b":"-bTs-3bFlum9G-6PhWRJN"}\n' +
  `1:${JSON.stringify({
    ok: true,
    results: [
      {
        trackingNumber,
        status: "配達完了",
        messageLines: [
          "お荷物のお届けが完了致しました。",
          "ご利用頂きありがとうございました。",
        ],
        dateLines: [{ label: "配達完了日　　：", value: "10月21日　12時55分" }],
        shippedDate: "",
        packageCount: "1個",
        history: [
          { status: "↓発送準備中", date: "10/19 20:04", office: "福岡営業所" },
          {
            status: "↓輸送中",
            date: "10/20 13:47",
            office: "関東中継センター",
          },
          { status: "↓配達中", date: "10/21 07:14", office: "八王子営業所" },
          { status: "⇒配達完了", date: "10/21 12:55", office: "八王子営業所" },
        ],
      },
    ],
  })}\n`;

class FakeFetcher extends CarrierUpstreamFetcher {
  public calls: Array<{ url: string; actionId: string | null }> = [];

  constructor(
    private readonly handler: (url: string, actionId: string | null) => Response
  ) {
    super({ carrier: new Sagawa() });
  }

  public async fetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString();
    const headers = new Headers(init?.headers);
    const actionId = headers.get("next-action");
    this.calls.push({ url, actionId });
    return this.handler(url, actionId);
  }
}

const newCarrier = async (fetcher: FakeFetcher): Promise<Sagawa> => {
  const carrier = new Sagawa();
  await carrier.init({ upstreamFetcher: fetcher });
  return carrier;
};

describe("jp.sagawa (e-customer)", () => {
  let currentActionId: string;

  beforeEach(() => {
    currentActionId = ACTION_ID;
  });

  const handler =
    (body: (trackingNumber: string) => string, trackingNumber: string) =>
    (url: string, actionId: string | null): Response => {
      if (url.endsWith("/k2k") && actionId === null) {
        return new Response(pageHtml());
      }
      if (url.endsWith("aaa.js")) {
        return new Response("console.log(1)");
      }
      if (url.endsWith("bbb.js")) {
        return new Response(chunk(currentActionId));
      }
      if (actionId !== currentActionId) {
        return new Response("Server action not found.", { status: 404 });
      }
      return new Response(body(trackingNumber));
    };

  it("parses a delivered shipment", async () => {
    const fetcher = new FakeFetcher(handler(deliveredResponse, "360211174820"));
    const info = await (
      await newCarrier(fetcher)
    ).track({
      trackingNumber: "360211174820",
    });

    expect(info.events.map((it) => it.status.code)).toEqual([
      TrackEventStatusCode.AtPickup,
      TrackEventStatusCode.InTransit,
      TrackEventStatusCode.OutForDelivery,
      TrackEventStatusCode.Delivered,
    ]);
    const last = info.events[3];
    expect(last.time?.toFormat("MM/dd HH:mm")).toBe("10/21 12:55");
    expect(last.time?.zoneName).toBe("Asia/Tokyo");
    expect(last.location?.name).toBe("八王子営業所");
  });

  it("rediscovers the action id when Sagawa redeploys", async () => {
    const fetcher = new FakeFetcher(handler(deliveredResponse, "360211174821"));
    const carrier = await newCarrier(fetcher);
    await carrier.track({ trackingNumber: "360211174821" });

    currentActionId = NEW_ACTION_ID;
    fetcher.calls = [];
    const info = await carrier.track({ trackingNumber: "360211174821" });

    expect(info.events).toHaveLength(4);
    const actionCalls = fetcher.calls
      .filter((it) => it.actionId !== null)
      .map((it) => it.actionId);
    expect(actionCalls).toEqual([ACTION_ID, NEW_ACTION_ID]);
  });

  it("treats 配達完了（宅配BOX） as delivered", async () => {
    const boxResponse = (trackingNumber: string): string =>
      deliveredResponse(trackingNumber).replace(
        "⇒配達完了",
        "⇒配達完了（宅配BOX）"
      );
    const fetcher = new FakeFetcher(handler(boxResponse, "360211174853"));
    const info = await (
      await newCarrier(fetcher)
    ).track({ trackingNumber: "360211174853" });

    expect(info.events[3].status.code).toBe(TrackEventStatusCode.Delivered);
  });

  it("throws NotFoundError when there is no data", async () => {
    const notFound = (trackingNumber: string): string =>
      `1:${JSON.stringify({
        ok: true,
        results: [
          {
            trackingNumber,
            status: "該当なし",
            messageLines: ["お荷物データが登録されておりません。"],
            history: [],
          },
        ],
      })}\n`;
    const fetcher = new FakeFetcher(handler(notFound, "123456789012"));

    await expect(
      (await newCarrier(fetcher)).track({ trackingNumber: "123456789012" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ignores RSC lines without results", () => {
    expect(parseSearchResponse('0:{"a":"$@1"}\n2:"$undefined"\n')).toBeNull();
  });

  it.each([
    ["↓集荷", TrackEventStatusCode.AtPickup],
    ["↓発送準備中", TrackEventStatusCode.AtPickup],
    ["↓輸送中", TrackEventStatusCode.InTransit],
    ["↓配達中", TrackEventStatusCode.OutForDelivery],
    ["↓ご不在", TrackEventStatusCode.AttemptFail],
    ["↓持戻り", TrackEventStatusCode.AttemptFail],
    ["↓保管中", TrackEventStatusCode.AvailableForPickup],
    ["↓営業所受取", TrackEventStatusCode.AvailableForPickup],
    ["⇒配達完了", TrackEventStatusCode.Delivered],
    ["⇒配達完了（宅配BOX）", TrackEventStatusCode.Delivered],
    ["⇒配達完了【宅配BOX】", TrackEventStatusCode.Delivered],
    ["↓調査中", TrackEventStatusCode.Exception],
  ])("maps %s -> %s", (text, expected) => {
    expect(mapSagawaStatus(text)).toBe(expected);
  });
});

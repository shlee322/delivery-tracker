import { describe, expect, it } from "@jest/globals";
import { JapanPost, mapJapanPostStatus } from ".";
import { CarrierUpstreamFetcher } from "../../carrier-upstream-fetcher/CarrierUpstreamFetcher";
import { TrackEventStatusCode } from "../../core";
import { NotFoundError } from "../../core/errors";

// Trimmed from the public tracking page (2026-10-27, レターパックプラス)
const historyHtml = `
<table class="tableType01 txt_c m_b5" summary="配達状況詳細">
  <tr><th>お問い合わせ番号</th><th>商品種別</th></tr>
  <tr><td class="w_180">6274-0260-9050</td><td class="w_480">レターパックプラス</td></tr>
</table>
<table class="tableType01 txt_c m_b5" summary="履歴情報">
  <tr>
    <th rowspan="2">状態発生日</th><th rowspan="2">配送履歴</th><th rowspan="2">詳細</th>
    <th>取扱局</th><th rowspan="2">県名等</th>
  </tr>
  <tr><th>郵便番号</th></tr>
  <tr>
    <td rowspan="2" class="w_120">2026/10/08 14:29</td>
    <td rowspan="2" class="w_150">引受</td>
    <td rowspan="2" class="w_180"></td>
    <td class="w_105">芝郵便局</td>
    <td rowspan="2" class="w_105">東京都</td>
  </tr>
  <tr><td class="w_105">105-8799</td></tr>
  <tr>
    <td rowspan="2" class="w_120">2026/10/09</td>
    <td rowspan="2" class="w_150">保管</td>
    <td rowspan="2" class="w_180"></td>
    <td class="w_105">井原郵便局</td>
    <td rowspan="2" class="w_105">岡山県</td>
  </tr>
  <tr><td class="w_105">715-8799</td></tr>
  <tr>
    <td rowspan="2" class="w_120">2026/10/18 13:40</td>
    <td rowspan="2" class="w_150">窓口でお渡し</td>
    <td rowspan="2" class="w_180"></td>
    <td class="w_105">井原郵便局</td>
    <td rowspan="2" class="w_105">岡山県</td>
  </tr>
  <tr><td class="w_105">715-8799</td></tr>
</table>`;

const notFoundHtml = `
<table class="tableType01 txt_c m_b5" summary="照会結果">
  <tr><th>お問い合わせ番号</th><th>商品種別</th><th>最新年月日</th><th>最新状態</th><th>最新取扱局</th><th>県名等</th></tr>
  <tr><th>郵便番号</th></tr>
  <tr>
    <td>123456789012</td>
    <td colspan="5" class="txt_l"><font color="ff0000">＊＊ お問い合わせ番号が見つかりません。お問い合わせ番号をご確認の上、お近くの取扱店にお問い合わせください。</font></td>
  </tr>
</table>`;

class FakeFetcher extends CarrierUpstreamFetcher {
  public urls: string[] = [];

  constructor(private readonly html: string) {
    super({ carrier: new JapanPost() });
  }

  public async fetch(input: RequestInfo | URL): Promise<Response> {
    this.urls.push(input instanceof Request ? input.url : input.toString());
    return new Response(this.html);
  }
}

const track = async (
  html: string,
  trackingNumber: string
): Promise<{
  info: Awaited<ReturnType<JapanPost["track"]>>;
  fetcher: FakeFetcher;
}> => {
  const fetcher = new FakeFetcher(html);
  const carrier = new JapanPost();
  await carrier.init({ upstreamFetcher: fetcher });
  const info = await carrier.track({ trackingNumber });
  return { info, fetcher };
};

describe("jp.japanpost", () => {
  it("parses history rows", async () => {
    const { info, fetcher } = await track(historyHtml, "6274-0260-9050");

    expect(fetcher.urls[0]).toContain("reqCodeNo1=627402609050");
    expect(info.events.map((it) => it.status.code)).toEqual([
      TrackEventStatusCode.AtPickup,
      TrackEventStatusCode.AvailableForPickup,
      TrackEventStatusCode.Delivered,
    ]);
    expect(info.events[0].time?.toISO()).toBe("2026-10-08T14:29:00.000+09:00");
    expect(info.events[1].time?.toISODate()).toBe("2026-10-09");
    expect(info.events[2].location?.name).toBe("井原郵便局");
    expect(info.events[2].description).toBe(
      "井原郵便局 - 窓口でお渡し - 岡山県"
    );
  });

  it("throws NotFoundError for an unknown number", async () => {
    await expect(track(notFoundHtml, "123456789012")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it.each([
    ["引受", TrackEventStatusCode.AtPickup],
    ["中継", TrackEventStatusCode.InTransit],
    ["到着", TrackEventStatusCode.InTransit],
    ["通過", TrackEventStatusCode.InTransit],
    ["通過（車又は船輸送に変更）", TrackEventStatusCode.InTransit],
    ["転送", TrackEventStatusCode.InTransit],
    ["最寄局・最寄店送付", TrackEventStatusCode.InTransit],
    ["配達希望受付", TrackEventStatusCode.InTransit],
    ["国際交換局から発送", TrackEventStatusCode.InTransit],
    ["国際交換局に到着", TrackEventStatusCode.InTransit],
    ["輸出申告手続中", TrackEventStatusCode.InTransit],
    ["通関手続中", TrackEventStatusCode.InTransit],
    ["保税運送中", TrackEventStatusCode.InTransit],
    ["保税運送到着", TrackEventStatusCode.InTransit],
    ["税関から受領", TrackEventStatusCode.InTransit],
    ["税関から名宛人に照会中", TrackEventStatusCode.InTransit],
    ["税関検査のため税関へ提示", TrackEventStatusCode.InTransit],
    ["植物検疫中", TrackEventStatusCode.InTransit],
    ["持ち出し中", TrackEventStatusCode.OutForDelivery],
    ["ご不在のため持ち戻り", TrackEventStatusCode.AttemptFail],
    ["保管", TrackEventStatusCode.AvailableForPickup],
    ["私書箱保管", TrackEventStatusCode.AvailableForPickup],
    ["お届け先休日等のため保管", TrackEventStatusCode.AvailableForPickup],
    ["保管期間延長受付", TrackEventStatusCode.AvailableForPickup],
    ["はこぽす等に入庫", TrackEventStatusCode.AvailableForPickup],
    ["コンビニエンスストア等に引渡", TrackEventStatusCode.AvailableForPickup],
    ["お届け先にお届け済み", TrackEventStatusCode.Delivered],
    ["窓口でお渡し", TrackEventStatusCode.Delivered],
    ["差出人に返送", TrackEventStatusCode.Exception],
    ["調査中", TrackEventStatusCode.Exception],
    ["輸入取止め", TrackEventStatusCode.Exception],
  ])("maps %s -> %s", (text, expected) => {
    expect(mapJapanPostStatus(text)).toBe(expected);
  });
});

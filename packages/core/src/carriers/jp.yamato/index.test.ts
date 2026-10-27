import { describe, expect, it } from "@jest/globals";
import { mapYamatoStatus } from ".";
import { TrackEventStatusCode as S } from "../../core";

// Status names seen on real shipments and on Yamato's tracking page.
const cases: Array<[string, S]> = [
  ["出荷指示", S.InformationReceived],
  ["荷物受付", S.AtPickup],
  ["発送済み", S.InTransit],
  ["輸送中", S.InTransit],
  ["作業店通過", S.InTransit],
  ["輸送経路修正", S.InTransit],
  ["配達店到着", S.InTransit],
  ["配達予定", S.InTransit],
  ["転送", S.InTransit],
  ["依頼受付（再配達）", S.InTransit],
  ["依頼受付（受取方法）", S.InTransit],
  ["依頼受付（日・時間帯変更）", S.InTransit],
  ["依頼受付（置き場所変更）", S.InTransit],
  ["配達日・時間帯指定（保管中）", S.InTransit],
  ["日・時間帯変更", S.InTransit],
  ["配達中", S.OutForDelivery],
  ["投函予定", S.OutForDelivery],
  ["持戻（ご不在）", S.AttemptFail],
  ["持戻（ポスト投函不可）", S.AttemptFail],
  ["持戻（宅配BOX不可）空無し", S.AttemptFail],
  ["保管中（ご指定店）", S.AvailableForPickup],
  ["配達担当店保管中", S.AvailableForPickup],
  ["ご来店予定", S.AvailableForPickup],
  ["配達完了", S.Delivered],
  ["配達完了（宅配ボックス）", S.Delivered],
  ["お客様引渡完了", S.Delivered],
  ["投函完了", S.Delivered],
  ["調査中", S.Exception],
  ["返品", S.Exception],
];

describe("jp.yamato status mapping", () => {
  it.each(cases)("%s -> %s", (text, expected) => {
    expect(mapYamatoStatus(text)).toBe(expected);
  });

  it("returns Unknown for an unseen status", () => {
    expect(mapYamatoStatus("新しいステータス")).toBe(S.Unknown);
  });
});

import { z } from "zod";

const GlobalDetailResponseModuleDetailSchema = z.object({
  actionCode: z.string(),
  desc: z.string(),
  descTitle: z.string(),
  group: z.unknown(),
  standerdDesc: z.string(),
  time: z.number(),
  timeStr: z.string(),
  timeZone: z.string(),
});

const GlobalDetailResponseModuleSchema = z.object({
  daysNumber: z.string(),
  destCountry: z.string(),
  destCpInfo: z.unknown(),
  detailList: z.array(GlobalDetailResponseModuleDetailSchema),
  globalCombinedLogisticsTraceDTO: z.unknown(),
  latestTrace: z.unknown(),
  mailNo: z.string(),
  mailNoSource: z.string(),
  originCountry: z.string(),
  processInfo: z.unknown(),
  status: z.string(),
  statusDesc: z.string(),
});

const GlobalDetailResponseSchema = z.object({
  success: z.boolean(),
  module: z.array(GlobalDetailResponseModuleSchema),
});

export {
  GlobalDetailResponseSchema,
  GlobalDetailResponseModuleSchema,
  GlobalDetailResponseModuleDetailSchema,
};

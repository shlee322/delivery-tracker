import { z } from "zod";

const CwayDetailResponseDataSchema = z.object({
  /** receiver name */
  receiver: z.string(),
});

const CwayDetailResponseSchema = z.object({
  code: z.number(),
  data: CwayDetailResponseDataSchema.nullable(),
});

const CwayLogListResponseRowSchema = z.object({
  logTime: z.string(),
  /** 현재 위치 */
  logDetail: z.string(),
  /** 배송상태 */
  logStatus: z.string(),
});

const CwayLogListResponseSchema = z.object({
  rows: z.array(CwayLogListResponseRowSchema),
});

export {
  CwayDetailResponseDataSchema,
  CwayDetailResponseSchema,
  CwayLogListResponseRowSchema,
  CwayLogListResponseSchema,
};

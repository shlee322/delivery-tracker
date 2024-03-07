import { z } from "zod";

const LotteGlobalLogisticsGetCustomerInvTrackingResponseTrackingItemSchema =
  z.object({
    BRNSHP_CD: z.string(),
    BRNSHP_NM: z.string(),
    BRNSHP_TEL: z.string(),
    EMP_NM: z.string().nullable(),
    EMP_NO: z.string(),
    EMP_TEL: z.string().nullable(),
    GODS_STAT_CD: z.string(),
    GODS_STAT_NM: z.string(),
    PTN_BRNSHP_CD: z.string(),
    PTN_BRNSHP_NM: z.string(),
    PTN_BRNSHP_TEL: z.string(),
    SCAN_TME: z.string(),
    SCAN_YMD: z.string(),
    STATUS: z.string(),
  });

const LotteGlobalLogisticsGetCustomerInvTrackingResponseSchema = z.object({
  errorCd: z.string(),
  errorNm: z.string(),
  result: z.unknown(),
  tracking: z.array(
    LotteGlobalLogisticsGetCustomerInvTrackingResponseTrackingItemSchema
  ),
  user: z.unknown(),
});

export {
  LotteGlobalLogisticsGetCustomerInvTrackingResponseSchema,
  LotteGlobalLogisticsGetCustomerInvTrackingResponseTrackingItemSchema,
};

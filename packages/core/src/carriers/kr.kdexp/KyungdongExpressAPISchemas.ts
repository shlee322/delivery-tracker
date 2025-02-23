import { z } from "zod";

const KyungdongExpressTrackingResponseDataScanListItemSchema = z.object({
  regDt: z.string(),
  scanType: z.string(),
  scanTypeNm: z.string(),
  strtPointNm: z.string(),
  strtPointTelno: z.string(),
});

type KyungdongExpressTrackingResponseDataScanListItem = z.infer<
  typeof KyungdongExpressTrackingResponseDataScanListItemSchema
>;

const KyungdongExpressTrackingResponseDataSchema = z.object({
  scanList: z.array(KyungdongExpressTrackingResponseDataScanListItemSchema),
});

const KyungdongExpressTrackingResponseSchema = z.object({
  result: z.string(),
  data: KyungdongExpressTrackingResponseDataSchema.optional(),
  searchVO: z.any(),
  "org.springframework.validation.BindingResult.searchVO": z.any(),
});

type KyungdongExpressTrackingResponse = z.infer<
  typeof KyungdongExpressTrackingResponseSchema
>;

export {
  type KyungdongExpressTrackingResponseDataScanListItem,
  KyungdongExpressTrackingResponseSchema,
  type KyungdongExpressTrackingResponse,
};

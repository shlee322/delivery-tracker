import { z } from "zod";

const LegacyKyungdongExpressTrackingResponseItemSchema = z.object({
  reg_date: z.string(),
  stat: z.string(),
  location: z.string(),
  tel: z.string(),
});

type LegacyKyungdongExpressTrackingResponseItem = z.infer<
  typeof LegacyKyungdongExpressTrackingResponseItemSchema
>;

const LegacyKyungdongExpressTrackingResponseSchema = z.object({
  result: z.string().optional(),
  items: z.array(LegacyKyungdongExpressTrackingResponseItemSchema).optional(),
  searchVO: z.any(),
  "org.springframework.validation.BindingResult.searchVO": z.any(),
});

type LegacyKyungdongExpressTrackingResponse = z.infer<
  typeof LegacyKyungdongExpressTrackingResponseSchema
>;

export {
  LegacyKyungdongExpressTrackingResponseSchema,
  type LegacyKyungdongExpressTrackingResponse,
  LegacyKyungdongExpressTrackingResponseItemSchema,
  type LegacyKyungdongExpressTrackingResponseItem,
};

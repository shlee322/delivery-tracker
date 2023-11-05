import { z } from "zod";

const KyungdongExpressTrackingResponseItemSchema = z.object({
  reg_date: z.string(),
  stat: z.string(),
  location: z.string(),
  tel: z.string(),
});

type KyungdongExpressTrackingResponseItem = z.infer<
  typeof KyungdongExpressTrackingResponseItemSchema
>;

const KyungdongExpressTrackingResponseSchema = z.object({
  result: z.string().nullable(),
  items: z.array(KyungdongExpressTrackingResponseItemSchema).nullable(),
});

type KyungdongExpressTrackingResponse = z.infer<
  typeof KyungdongExpressTrackingResponseSchema
>;

export {
  KyungdongExpressTrackingResponseSchema,
  type KyungdongExpressTrackingResponse,
  KyungdongExpressTrackingResponseItemSchema,
  type KyungdongExpressTrackingResponseItem,
};

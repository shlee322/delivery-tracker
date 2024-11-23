import { z } from "zod";

const DeliveryResponseDataDeliveryOrderStatusHistoryListItemSchema = z.object({
  statusDateTime: z.string(),
  trackingStatus: z.string(),
  trackingStatusName: z.string(),
  tmsStatusName: z.string().nullable(),
  location: z.string().nullable(),
  contents: z.string().nullable(),
});

const DeliveryResponseDataDeliverySchema = z.object({
  orderStatusHistoryList: z.array(
    DeliveryResponseDataDeliveryOrderStatusHistoryListItemSchema
  ),
});

const DeliveryResponseDataSchema = z.object({
  cancelTypeList: z.unknown(),
  orderCancelType: z.string(),
  delivery: DeliveryResponseDataDeliverySchema,
});

const DeliveryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullable(),
  responseDateTime: z.string(),
  data: DeliveryResponseDataSchema,
});

type DeliveryResponseDataDeliveryOrderStatusHistoryListItem = z.infer<
  typeof DeliveryResponseDataDeliveryOrderStatusHistoryListItemSchema
>;
type DeliveryResponse = z.infer<typeof DeliveryResponseSchema>;

export {
  DeliveryResponseSchema,
  type DeliveryResponse,
  DeliveryResponseDataDeliveryOrderStatusHistoryListItemSchema,
  type DeliveryResponseDataDeliveryOrderStatusHistoryListItem,
};

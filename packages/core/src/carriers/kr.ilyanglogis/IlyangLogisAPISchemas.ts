import { z } from "zod";

const IlyangLogisTrackingInfoResponseResultAPIBodyResultListTrackingSchema =
  z.object({
    actDate: z.string(),
    actTime: z.string(),
    chkPointDesc: z.string(),
    stationName: z.string(),
    stationTel: z.string(),
  });

type IlyangLogisTrackingInfoResponseResultAPIBodyResultListTracking = z.infer<
  typeof IlyangLogisTrackingInfoResponseResultAPIBodyResultListTrackingSchema
>;

const IlyangLogisTrackingInfoResponseResultAPIBodyResultListSchema = z.object({
  resultCode: z.string(),
  lastTrackingDesc: z.string(),
  resultDesc: z.string(),
  tracking: z
    .array(IlyangLogisTrackingInfoResponseResultAPIBodyResultListTrackingSchema)
    .nullable(),
});

const IlyangLogisTrackingInfoResponseResultAPIBodySchema = z.object({
  resultList: z.array(
    IlyangLogisTrackingInfoResponseResultAPIBodyResultListSchema
  ),
});

const IlyangLogisTrackingInfoResponseResultAPIHeadSchema = z.object({
  returnCode: z.string(),
  returnDesc: z.string(),
});

const IlyangLogisTrackingInfoResponseResultAPISchema = z.object({
  body: IlyangLogisTrackingInfoResponseResultAPIBodySchema.nullable(),
  head: IlyangLogisTrackingInfoResponseResultAPIHeadSchema,
});

const IlyangLogisTrackingInfoResponseSchema = z.object({
  resultAPI: IlyangLogisTrackingInfoResponseResultAPISchema,
  resultCode: z.string(),
  resultMsg: z.string(),
});

type IlyangLogisTrackingInfoResponse = z.infer<
  typeof IlyangLogisTrackingInfoResponseSchema
>;

export {
  IlyangLogisTrackingInfoResponseSchema,
  type IlyangLogisTrackingInfoResponse,
  IlyangLogisTrackingInfoResponseResultAPIBodyResultListTrackingSchema,
  type IlyangLogisTrackingInfoResponseResultAPIBodyResultListTracking,
};

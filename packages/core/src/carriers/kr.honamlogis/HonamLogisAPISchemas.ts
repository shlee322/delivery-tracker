import { z } from "zod";

const HonamLogisTrackingInfoTrackTrackingDetailSchema = z.object({
  /* Date */
  SCAN_DM: z.string(),
  /* status */
  SCANGB_NM: z.string(),
  /* location name */
  SCAN_USER_NM: z.string(),
});
type HonamLogisTrackingInfoTrackTrackingDetail = z.infer<
  typeof HonamLogisTrackingInfoTrackTrackingDetailSchema
>;

const HonamLogisTrackingInfoTrackSchema = z.object({
  TRACKING_DTL: z.array(HonamLogisTrackingInfoTrackTrackingDetailSchema),
});

const HonamLogisTrackingInfoResponseSchema = z.object({
  MSG_ID: z.string(),
  ODS0_TOTAL: z.number(),
  ODS0: z.array(HonamLogisTrackingInfoTrackSchema),
});

type HonamLogisTrackingInfoResponse = z.infer<
  typeof HonamLogisTrackingInfoResponseSchema
>;

export {
  HonamLogisTrackingInfoTrackTrackingDetailSchema,
  type HonamLogisTrackingInfoTrackTrackingDetail,
  HonamLogisTrackingInfoResponseSchema,
  type HonamLogisTrackingInfoResponse,
};

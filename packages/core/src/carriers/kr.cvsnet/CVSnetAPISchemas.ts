import { z } from "zod";

const CVSnetTrackingInfoResponseContactSchema = z.object({
  baseAddress: z.string(),
  detailAddress: z.string(),
  name: z.string(),
  tel: z.string(),
});

type CVSnetTrackingInfoResponseContact = z.infer<
  typeof CVSnetTrackingInfoResponseContactSchema
>;

const CVSnetTrackingInfoResponseTrackingDetailSchema = z.object({
  /** "2023-01-01T00:00:00" */
  transTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  /** 3 */
  level: z.number(),
  /** "남양주저온센터" */
  transWhere: z.string(),
  /** "C02" */
  transCode: z.string(),
  /** "점포 → (집화)일배 입고" */
  transKind: z.string(),
});

type CVSnetTrackingInfoResponseTrackingDetail = z.infer<
  typeof CVSnetTrackingInfoResponseTrackingDetailSchema
>;

const CVSnetTrackingInfoResponseSchema = z.object({
  /** GS네트웍스 */
  carrierName: z.string(),
  /** GS_NETWORKS */
  carrierType: z.string(),
  /** 200 */
  code: z.number(),
  /** 잡화/서적 */
  goodsName: z.string(),
  /** 000000000000 */
  invoiceNo: z.string(),
  latestTrackingDetail: CVSnetTrackingInfoResponseTrackingDetailSchema,
  receiver: CVSnetTrackingInfoResponseContactSchema,
  sender: CVSnetTrackingInfoResponseContactSchema,
  /** 반값택배 */
  serviceName: z.string(),
  /** SLOW */
  serviceType: z.string(),
  trackingDetails: z.array(CVSnetTrackingInfoResponseTrackingDetailSchema),
});

type CVSnetTrackingInfoResponse = z.infer<
  typeof CVSnetTrackingInfoResponseSchema
>;

export {
  CVSnetTrackingInfoResponseContactSchema,
  type CVSnetTrackingInfoResponseContact,
  CVSnetTrackingInfoResponseTrackingDetailSchema,
  type CVSnetTrackingInfoResponseTrackingDetail,
  CVSnetTrackingInfoResponseSchema,
  type CVSnetTrackingInfoResponse,
};

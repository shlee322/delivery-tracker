import { z } from "zod";

const TrackingListResponseBodyListItemSchema = z.object({
  carrCd: z.string(),
  carrNm: z.string(),
  cneeNm: z.string(),
  currEvntCont1: z.string(),
  currEvntCont2: z.string(),
  currEvntDt: z.string(),
  engLocNm: z.string(),
  evntCd: z.string(),
  expsBizTypeCd: z.string(),
  fdestNm: z.string(),
  fltVslNm: z.string(),
  hblNo: z.string(),
  mblNo: z.string(),
  podNatnCd: z.string(),
  polNm: z.string(),
  refBlNo: z.string(),
  refBlNoCnt: z.number(),
  refBlNoList: z.string(),
  soNo: z.string(),
  trkrSvcCd: z.string(),
});

const TrackingListResponseBodySchema = z.object({
  list: z.array(TrackingListResponseBodyListItemSchema),
});

const TrackingListResponseSchema = z.object({
  body: TrackingListResponseBodySchema,
  header: z.unknown(),
  reqContent: z.string(),
  requestIpAddress: z.string(),
  trackingInfo: z.string(),
});

const TrackingListDtlResponseBodyItemSchema = z.object({
  eventDt: z.string(),
  evntCd: z.string(),
  evntCd2: z.string(),
  evntDesc: z.string(),
  evntDt: z.string(),
  evntDt2: z.string(),
  evntLocNm: z.string(),
  hblNo: z.string(),
  mblNo: z.string(),
  trkType: z.string(),
});

const TrackingListDtlResponseSchema = z.object({
  reqContent: z.string(),
  requestIpAddress: z.string(),
  trackingInfo: z.string(),
  header: z.unknown(),
  body: z.array(TrackingListDtlResponseBodyItemSchema),
});

export {
  TrackingListResponseSchema,
  TrackingListResponseBodySchema,
  TrackingListResponseBodyListItemSchema,
  TrackingListDtlResponseSchema,
  TrackingListDtlResponseBodyItemSchema,
};

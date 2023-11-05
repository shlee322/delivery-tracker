import { z } from "zod";

const CJLogisticsTrackingDetailResponseParcelResultMapResultSchema = z.object({
  /** Tracking Number */
  invcNo: z.string(),
  /** sender name */
  sendrNm: z.string(),
  /** recipient name */
  rcvrNm: z.string(),
  /** item name (carrierSpecificData) */
  itemNm: z.string(),
  /** item quantity (carrierSpecificData) */
  qty: z.string(),
  /** unknown : delivery tracker unknown field (carrierSpecificData) */
  rgmailNo: z.string(),
  /** unknown : delivery tracker unknown field (carrierSpecificData) */
  oriTrspbillnum: z.string(),
  /** unknown : delivery tracker unknown field (carrierSpecificData) */
  rtnTrspbillnum: z.string(),
  /** unknown : delivery tracker unknown field (carrierSpecificData) */
  nsDlvNm: z.string(),
});
type CJLogisticsTrackingDetailResponseParcelResultMapResult = z.infer<
  typeof CJLogisticsTrackingDetailResponseParcelResultMapResultSchema
>;

const CJLogisticsTrackingDetailResponseParcelDetailResultMapResultSchema =
  z.object({
    /**
     * status full message (carrierSpecificData)
     * ex) 배송지역으로 상품이 이동중입니다.
     */
    crgNm: z.string(),
    /** status code */
    crgSt: z.string(),
    /**
     *  time
     *  ex) 2023-01-01 00:00:00.0
     */
    dTime: z.string(),
    /** location id (carrierSpecificData) */
    regBranId: z.string(),
    /** location name */
    regBranNm: z.string(),
    /**
     * status text
     * ex) 간선상차
     */
    scanNm: z.string(),
    // /**
    //  * unknown : delivery tracker unknown field (carrierSpecificData)
    //  */
    // nsDlNm: z.string(),
    /**
     * unknown : delivery tracker unknown field (carrierSpecificData)
     */
    empImgNm: z.string(),
  });
type CJLogisticsTrackingDetailResponseParcelDetailResultMapResult = z.infer<
  typeof CJLogisticsTrackingDetailResponseParcelDetailResultMapResultSchema
>;

const CJLogisticsTrackingDetailResponseSchema = z.object({
  parcelResultMap: z.object({
    resultList: z.array(
      CJLogisticsTrackingDetailResponseParcelResultMapResultSchema
    ),
    /** Tracking Number */
    paramInvcNo: z.string(),
  }),
  parcelDetailResultMap: z.object({
    resultList: z.array(
      CJLogisticsTrackingDetailResponseParcelDetailResultMapResultSchema
    ),
    /** Tracking Number */
    paramInvcNo: z.string(),
  }),
});
type CJLogisticsTrackingDetailResponse = z.infer<
  typeof CJLogisticsTrackingDetailResponseSchema
>;

export {
  CJLogisticsTrackingDetailResponseParcelResultMapResultSchema,
  type CJLogisticsTrackingDetailResponseParcelResultMapResult,
  CJLogisticsTrackingDetailResponseParcelDetailResultMapResultSchema,
  type CJLogisticsTrackingDetailResponseParcelDetailResultMapResult,
  CJLogisticsTrackingDetailResponseSchema,
  type CJLogisticsTrackingDetailResponse,
};

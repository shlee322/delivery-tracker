import { z } from "zod";

const SearchInvoiceInfoResponseTrackDataListItemSchema = z.object({
  icon: z.string(),
  status: z.string(),
  status_text: z.string(),
  time: z.string(),
  type: z.number(),
});

const SearchInvoiceInfoResponseTrackDataSchema = z.object({
  express_status: z.number(),
  list: z.array(SearchInvoiceInfoResponseTrackDataListItemSchema),
  name: z.string(),
  status: z.number(),
  status_text: z.string(),
});

const SearchInvoiceInfoResponseErrorDataSchema = z.object({
  err_code: z.number(),
  err_msg: z.string(),
});

const SearchInvoiceInfoResponseTrackSchema = z.object({
  status: z.literal("100"),
  data: SearchInvoiceInfoResponseTrackDataSchema,
});

const SearchInvoiceInfoResponseErrorSchema = z.object({
  status: z.literal("101"),
  data: SearchInvoiceInfoResponseErrorDataSchema,
});

const SearchInvoiceInfoResponseSchema = z.discriminatedUnion("status", [
  SearchInvoiceInfoResponseTrackSchema,
  SearchInvoiceInfoResponseErrorSchema,
]);

export {
  SearchInvoiceInfoResponseSchema,
  SearchInvoiceInfoResponseErrorSchema,
  SearchInvoiceInfoResponseErrorDataSchema,
  SearchInvoiceInfoResponseTrackSchema,
  SearchInvoiceInfoResponseTrackDataSchema,
  SearchInvoiceInfoResponseTrackDataListItemSchema,
};

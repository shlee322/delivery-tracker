import { z } from "zod";

const SelectDmTrc060ResponseSchema = z.object({
  cancelcnt: z.string(),
  carcode: z.string(),
  centername: z.string(),
  centerphone: z.string(),
  code: z.string(),
  devcnt: z.number(),
  ordercnt: z.number(),
  ordernum: z.string(),
  phone: z.string(),
  receiveaddress: z.string(),
  receivename: z.string(),
  receivephone: z.string(),
  sendaddress: z.string(),
  sendname: z.string(),
  sendphone: z.string(),
  sendstatus: z.string(),
  seqnum: z.number(),
  username: z.string(),
  ymd: z.string(),
});

const SelectDmTrc060StatusResponseItemSchema = z.object({
  centername: z.string(),
  sendstatus: z.string(),
  seq: z.string(),
  state: z.string(),
  statecode: z.string(),
  ymd: z.string(),
});

const SelectDmTrc060StatusResponseSchema = z.array(
  SelectDmTrc060StatusResponseItemSchema
);

export {
  SelectDmTrc060ResponseSchema,
  SelectDmTrc060StatusResponseSchema,
  SelectDmTrc060StatusResponseItemSchema,
};

import { z } from "zod";

const TrackResponseTrackingEventSchema = z.object({
  code: z.string(),
  date: z.string(),
  description: z.string(),
  location: z.string(),
  time: z.string(),
});

const TrackResponseResponseHeaderSchema = z.object({
  result: z.enum(["success", "error"]),
  requestNo: z.unknown(),
  message: z.string(),
});

const TrackResponseSchema = z.object({
  orderHeader: z.unknown(),
  responseHeader: TrackResponseResponseHeaderSchema,
  trackingEvents: z
    .object({
      trackingEvents: z.array(TrackResponseTrackingEventSchema),
    })
    .nullable(),
});

export { TrackResponseSchema, TrackResponseTrackingEventSchema };

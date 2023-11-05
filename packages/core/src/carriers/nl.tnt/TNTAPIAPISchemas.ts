import { z } from "zod";

const TNTTrackingResponseTrackerOutputConsignmentEventLocationSchema = z.object(
  {
    city: z.string(),
    countryCode: z.string(),
  }
);

const TNTTrackingResponseTrackerOutputConsignmentEventSchema = z.object({
  date: z.string(),
  statusDescription: z.string(),
  location: TNTTrackingResponseTrackerOutputConsignmentEventLocationSchema,
});

const TNTTrackingResponseTrackerOutputConsignmentSchema = z.object({
  shipmentId: z.number(),
  consignmentNumber: z.string(),
  events: z.array(TNTTrackingResponseTrackerOutputConsignmentEventSchema),
});

const TNTTrackingResponseTrackerOutputSchema = z.object({
  consignment: z
    .array(TNTTrackingResponseTrackerOutputConsignmentSchema)
    .optional(),
  notFound: z.any().optional(),
});

const TNTTrackingResponseSchema = z.object({
  "tracker.output": TNTTrackingResponseTrackerOutputSchema,
});

type TNTTrackingResponseTrackerOutputConsignmentEventLocation = z.infer<
  typeof TNTTrackingResponseTrackerOutputConsignmentEventLocationSchema
>;
type TNTTrackingResponseTrackerOutputConsignmentEvent = z.infer<
  typeof TNTTrackingResponseTrackerOutputConsignmentEventSchema
>;
type TNTTrackingResponseTrackerOutputConsignment = z.infer<
  typeof TNTTrackingResponseTrackerOutputConsignmentSchema
>;
type TNTTrackingResponseTrackerOutput = z.infer<
  typeof TNTTrackingResponseTrackerOutputSchema
>;
type TNTTrackingResponse = z.infer<typeof TNTTrackingResponseSchema>;

export {
  TNTTrackingResponseTrackerOutputConsignmentEventLocationSchema,
  type TNTTrackingResponseTrackerOutputConsignmentEventLocation,
  TNTTrackingResponseTrackerOutputConsignmentEventSchema,
  type TNTTrackingResponseTrackerOutputConsignmentEvent,
  TNTTrackingResponseTrackerOutputConsignmentSchema,
  type TNTTrackingResponseTrackerOutputConsignment,
  TNTTrackingResponseTrackerOutputSchema,
  type TNTTrackingResponseTrackerOutput,
  TNTTrackingResponseSchema,
  type TNTTrackingResponse,
};

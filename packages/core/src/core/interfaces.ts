import { z } from "zod";
import { DateTime } from "luxon";
import { parsePhoneNumber } from "libphonenumber-js";
import { type CarrierUpstreamFetcher } from "../carrier-upstream-fetcher/CarrierUpstreamFetcher";

interface CarrierInitInput {
  upstreamFetcher: CarrierUpstreamFetcher;
}

abstract class Carrier {
  protected upstreamFetcher!: CarrierUpstreamFetcher;

  public async init(input: CarrierInitInput & any): Promise<void> {
    this.upstreamFetcher = input.upstreamFetcher;
  }

  public abstract track(input: CarrierTrackInput): Promise<TrackInfo>;
  public abstract get carrierId(): string;
}

interface CarrierTrackInput {
  trackingNumber: string;
}

const CarrierSpecificDataValueSchema = z.union([z.string(), z.number()]);
type CarrierSpecificDataValue = z.infer<typeof CarrierSpecificDataValueSchema>;

const CarrierSpecificDataSchema = z.union([
  z.map(z.string(), CarrierSpecificDataValueSchema),
  z
    .record(CarrierSpecificDataValueSchema)
    .transform((val) => new Map(Object.entries(val))),
]);
type CarrierSpecificData = z.infer<typeof CarrierSpecificDataSchema>;

enum TrackEventStatusCode {
  Unknown = "UNKNOWN",
  InformationReceived = "INFORMATION_RECEIVED",
  AtPickup = "AT_PICKUP",
  InTransit = "IN_TRANSIT",
  OutForDelivery = "OUT_FOR_DELIVERY",
  AttemptFail = "ATTEMPT_FAIL",
  Delivered = "DELIVERED",
  AvailableForPickup = "AVAILABLE_FOR_PICKUP",
  Exception = "EXCEPTION",
}

const LocationSchema = z.object({
  /** ISO 3166-1 alpha-2 country code */
  countryCode: z.string().nullable(),
  postalCode: z.string().nullable(),
  name: z.string().nullable(),
  carrierSpecificData: CarrierSpecificDataSchema,
});
type Location = z.infer<typeof LocationSchema>;

const PhoneNumberSchema = z.string().transform((val) => parsePhoneNumber(val));

const MaskedPhoneNumberSchema = z.object({
  "@type": z.literal("@delivery-tracker/core/MaskedPhoneNumber"),
  maskedPhoneNumber: z.string(),
});
type MaskedPhoneNumber = z.infer<typeof MaskedPhoneNumberSchema>;

const ContactInfoSchema = z.object({
  name: z.string().nullable(),
  location: LocationSchema.nullable(),
  phoneNumber: z.union([PhoneNumberSchema, MaskedPhoneNumberSchema]).nullable(),
  carrierSpecificData: CarrierSpecificDataSchema,
});
type ContactInfo = z.infer<typeof ContactInfoSchema>;

const TrackEventStatusSchema = z.object({
  code: z.nativeEnum(TrackEventStatusCode),
  name: z.string().nullable(),
  carrierSpecificData: CarrierSpecificDataSchema,
});
type TrackEventStatus = z.infer<typeof TrackEventStatusSchema>;

const TrackEventSchema = z.object({
  status: TrackEventStatusSchema,
  time: z
    .string()
    .transform((val) => DateTime.fromISO(val, { setZone: true }))
    .nullable(),
  location: LocationSchema.nullable(),
  contact: ContactInfoSchema.nullable(),
  description: z.string().nullable(),
  carrierSpecificData: CarrierSpecificDataSchema,
});
type TrackEvent = z.infer<typeof TrackEventSchema>;

const TrackInfoSchema = z.object({
  events: z.array(TrackEventSchema),
  sender: ContactInfoSchema.nullable(),
  recipient: ContactInfoSchema.nullable(),
  carrierSpecificData: CarrierSpecificDataSchema,
});
type TrackInfo = z.infer<typeof TrackInfoSchema>;

export {
  Carrier,
  type CarrierInitInput,
  type CarrierTrackInput,
  TrackInfoSchema,
  type TrackInfo,
  TrackEventStatusSchema,
  type TrackEventStatus,
  TrackEventSchema,
  type TrackEvent,
  TrackEventStatusCode,
  LocationSchema,
  type Location,
  ContactInfoSchema,
  type ContactInfo,
  MaskedPhoneNumberSchema,
  type MaskedPhoneNumber,
};

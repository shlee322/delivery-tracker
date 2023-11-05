import {
  QueryResolvers as CarrierQueryResolvers,
  CarrierResolvers,
} from "./carrier";
import {
  ContactInfoResolvers,
  LocationResolvers,
  QueryResolvers as TrackQueryResolvers,
  TrackEventResolvers,
  TrackInfoResolvers,
  TrackEventStatusResolvers,
  type TrackInfoContext,
  type TrackEventContext,
  type ContactInfoContext,
  type LocationContext,
} from "./track";

const resolvers = {
  Query: {
    ...CarrierQueryResolvers,
    ...TrackQueryResolvers,
  },
  Carrier: {
    ...CarrierResolvers,
  },
  TrackInfo: {
    ...TrackInfoResolvers,
  },
  TrackEvent: {
    ...TrackEventResolvers,
  },
  TrackEventStatus: {
    ...TrackEventStatusResolvers,
  },
  ContactInfo: {
    ...ContactInfoResolvers,
  },
  Location: {
    ...LocationResolvers,
  },
};

export {
  resolvers,
  type TrackInfoContext,
  type TrackEventContext,
  type ContactInfoContext,
  type LocationContext,
};

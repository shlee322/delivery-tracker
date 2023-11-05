import { GraphQLError } from "graphql/error";
import { type GraphQLResolveInfo } from "graphql/type";
import { apiRootLogger } from "../logger";
import {
  type TrackInfo,
  type TrackEvent,
  TrackEventStatusCode,
  type ContactInfo,
  type Location,
  errors,
} from "@delivery-tracker/core";
import { type AppContext } from "../AppContext";
import * as schema from "../schema/generated/resolvers-types";
import { type ContactInfoPhoneNumberArgs } from "../schema/generated/resolvers-types";
import { ArrayCursorConnection } from "../cursor/ArrayCursorConnection";

interface TrackInfoContext {
  trackingNumber: string;
  trackInfo: TrackInfo;
}

interface TrackEventContext {
  trackInfoContext: TrackInfoContext;
  trackEvent: TrackEvent;
}

interface ContactInfoContext {
  trackInfoContext: TrackInfoContext;
  self: ContactInfo;
}

interface LocationContext {
  trackInfoContext: TrackInfoContext;
  self: Location;
}

async function queryTrackResolver(
  parent: undefined,
  args: schema.QueryTrackArgs,
  contextValue: { appContext: AppContext },
  info: GraphQLResolveInfo
): Promise<TrackInfoContext> {
  const carrier = contextValue.appContext.carrierRegistry.get(args.carrierId);
  if (carrier == null) {
    throw new GraphQLError("Carrier not found", {
      extensions: {
        code: schema.ErrorCode.NotFound,
      },
    });
  }

  let trackInfo = null;
  try {
    trackInfo = await carrier.track({
      trackingNumber: args.trackingNumber,
      // @ts-expect-error
      context: contextValue,
    });
  } catch (e) {
    if (
      e instanceof errors.TrackError &&
      !(e instanceof errors.InternalError)
    ) {
      throw new GraphQLError(e.message ?? e.code, {
        originalError: e,
        extensions: {
          code: e.code,
        },
      });
    }

    apiRootLogger.error("track error", {
      carrierId: carrier.carrierId,
      trackingNumber: args.trackingNumber,
      error: e,
    });

    if (e instanceof Error) {
      throw new GraphQLError("Please try again in a few minutes.", {
        originalError: e,
        extensions: {
          code: schema.ErrorCode.Internal,
        },
      });
    } else {
      throw new GraphQLError("Please try again in a few minutes.", {
        extensions: {
          code: schema.ErrorCode.Internal,
        },
      });
    }
  }

  return {
    trackingNumber: args.trackingNumber,
    trackInfo,
  };
}

function trackInfoTrackingNumberResolver(
  parent: TrackInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string {
  return parent.trackingNumber;
}

function trackInfoLastEventResolver(
  parent: TrackInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): TrackEventContext | null {
  const reversedEvents = [...parent.trackInfo.events].reverse();
  const deliveredEvent =
    reversedEvents.find((item) => {
      return item.status.code === TrackEventStatusCode.Delivered;
    }) ?? null;

  if (deliveredEvent !== null) {
    return {
      trackInfoContext: parent,
      trackEvent: deliveredEvent,
    };
  }

  return {
    trackInfoContext: parent,
    trackEvent: parent.trackInfo.events[parent.trackInfo.events.length - 1],
  };
}

function trackInfoEventsResolver(
  parent: TrackInfoContext,
  args: schema.TrackInfoEventsArgs,
  contextValue: undefined,
  info: GraphQLResolveInfo
): ArrayCursorConnection<TrackEventContext> {
  const events = parent.trackInfo.events.map((trackEvent) => ({
    trackInfoContext: parent,
    trackEvent,
  }));
  return new ArrayCursorConnection(
    events,
    20,
    args.first ?? null,
    args.after ?? null,
    args.last ?? null,
    args.before ?? null
  );
}

function trackInfoSenderResolver(
  parent: TrackInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): ContactInfoContext | null {
  if (parent.trackInfo.sender === null) {
    return null;
  }

  return {
    trackInfoContext: parent,
    self: parent.trackInfo.sender,
  };
}

function trackInfoRecipientResolver(
  parent: TrackInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): ContactInfoContext | null {
  if (parent.trackInfo.recipient === null) {
    return null;
  }

  return {
    trackInfoContext: parent,
    self: parent.trackInfo.recipient,
  };
}

function trackEventStatusResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): TrackEventContext {
  return parent;
}

function trackEventTimeResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): schema.Scalars["DateTime"] | null {
  return parent.trackEvent.time?.toISO() ?? null;
}

function trackEventLocationResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): LocationContext | null {
  if (parent.trackEvent.location === null) {
    return null;
  }

  return {
    trackInfoContext: parent.trackInfoContext,
    self: parent.trackEvent.location,
  };
}

function trackEventContactResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): ContactInfoContext | null {
  if (parent.trackEvent.contact === null) {
    return null;
  }

  return {
    trackInfoContext: parent.trackInfoContext,
    self: parent.trackEvent.contact,
  };
}

function trackEventDescriptionResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.trackEvent.description;
}

function trackEventStatusCodeResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): schema.TrackEventStatusCode {
  switch (parent.trackEvent.status.code) {
    case TrackEventStatusCode.Unknown:
      return schema.TrackEventStatusCode.Unknown;
    case TrackEventStatusCode.InformationReceived:
      return schema.TrackEventStatusCode.InformationReceived;
    case TrackEventStatusCode.AtPickup:
      return schema.TrackEventStatusCode.AtPickup;
    case TrackEventStatusCode.InTransit:
      return schema.TrackEventStatusCode.InTransit;
    case TrackEventStatusCode.OutForDelivery:
      return schema.TrackEventStatusCode.OutForDelivery;
    case TrackEventStatusCode.AttemptFail:
      return schema.TrackEventStatusCode.AttemptFail;
    case TrackEventStatusCode.Delivered:
      return schema.TrackEventStatusCode.Delivered;
    case TrackEventStatusCode.AvailableForPickup:
      return schema.TrackEventStatusCode.AvailableForPickup;
    case TrackEventStatusCode.Exception:
      return schema.TrackEventStatusCode.Exception;
  }

  apiRootLogger.warn("Unknown TrackEventStatusCode", {
    trackingNumber: parent.trackInfoContext.trackingNumber,
    statusCode: parent.trackEvent.status.code,
  });

  return schema.TrackEventStatusCode.Unknown;
}

function trackEventStatusNameResolver(
  parent: TrackEventContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.trackEvent.status.name;
}

function contactInfoNameResolver(
  parent: ContactInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.self.name;
}

function contactInfoLocationResolver(
  parent: ContactInfoContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): LocationContext | null {
  if (parent.self.location === null) {
    return null;
  }

  return {
    trackInfoContext: parent.trackInfoContext,
    self: parent.self.location,
  };
}

function contactInfoPhoneNumberResolver(
  parent: ContactInfoContext,
  args: ContactInfoPhoneNumberArgs,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  if (parent.self.phoneNumber === null) {
    return null;
  }

  if (
    typeof parent.self.phoneNumber === "object" &&
    "maskedPhoneNumber" in parent.self.phoneNumber
  ) {
    if (args.allowInvalidFormat !== false) {
      return null;
    }

    return parent.self.phoneNumber.maskedPhoneNumber;
  }

  return parent.self.phoneNumber.number;
}

function locationCountryCodeResolver(
  parent: LocationContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.self.countryCode;
}

function locationPostalCodeResolver(
  parent: LocationContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.self.postalCode;
}

function locationNameResolver(
  parent: LocationContext,
  args: undefined,
  contextValue: undefined,
  info: GraphQLResolveInfo
): string | null {
  return parent.self.name;
}

const QueryResolvers = {
  track: queryTrackResolver,
};

const TrackInfoResolvers = {
  trackingNumber: trackInfoTrackingNumberResolver,
  lastEvent: trackInfoLastEventResolver,
  events: trackInfoEventsResolver,
  sender: trackInfoSenderResolver,
  recipient: trackInfoRecipientResolver,
};

const TrackEventResolvers = {
  status: trackEventStatusResolver,
  time: trackEventTimeResolver,
  location: trackEventLocationResolver,
  contact: trackEventContactResolver,
  description: trackEventDescriptionResolver,
};

const TrackEventStatusResolvers = {
  code: trackEventStatusCodeResolver,
  name: trackEventStatusNameResolver,
};

const ContactInfoResolvers = {
  name: contactInfoNameResolver,
  location: contactInfoLocationResolver,
  phoneNumber: contactInfoPhoneNumberResolver,
};

const LocationResolvers = {
  countryCode: locationCountryCodeResolver,
  postalCode: locationPostalCodeResolver,
  name: locationNameResolver,
};

export {
  QueryResolvers,
  TrackInfoResolvers,
  TrackEventResolvers,
  TrackEventStatusResolvers,
  ContactInfoResolvers,
  LocationResolvers,
  type TrackInfoContext,
  type TrackEventContext,
  type ContactInfoContext,
  type LocationContext,
};

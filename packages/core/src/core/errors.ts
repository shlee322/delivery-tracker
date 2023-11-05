abstract class TrackError extends Error {
  public readonly isTrackError = true;
  public abstract kind: string;
  public abstract code: string;
}

class BadRequestError extends TrackError {
  public readonly kind: string = "BadRequestError";
  public readonly code: string = "BAD_REQUEST";
}

class NotFoundError extends TrackError {
  public readonly kind: string = "NotFoundError";
  public readonly code: string = "NOT_FOUND";
}

class InternalError extends TrackError {
  public readonly kind: string = "InternalError";
  public readonly code: string = "INTERNAL";
}

export { TrackError, BadRequestError, NotFoundError, InternalError };

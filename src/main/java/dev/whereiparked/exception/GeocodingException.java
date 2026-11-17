package dev.whereiparked.exception;

public class GeocodingException extends RuntimeException {
    public enum Reason {
        ADDRESS_NOT_FOUND, GEOCODING_RATE_LIMITED, GEOCODING_UNAVAILABLE, GEOCODING_TIMEOUT
    }

    private final Reason reason;

    public GeocodingException(Reason reason) {
        // Do not retain provider exceptions: they may contain coordinates or request URLs.
        super(reason.name());
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}

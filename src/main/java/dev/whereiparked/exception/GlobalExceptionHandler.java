package dev.whereiparked.exception;

import dev.whereiparked.dto.ApiError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler({MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class, HandlerMethodValidationException.class})
    ResponseEntity<ApiError> invalidCoordinates(Exception ignored) {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_COORDINATES",
                "Latitude must be between -90 and 90 and longitude between -180 and 180"));
    }

    @ExceptionHandler(GeocodingException.class)
    ResponseEntity<ApiError> geocoding(GeocodingException exception) {
        HttpStatus status = switch (exception.reason()) {
            case ADDRESS_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case GEOCODING_RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            case GEOCODING_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case GEOCODING_TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
        };
        String message = switch (exception.reason()) {
            case ADDRESS_NOT_FOUND -> "No useful address found for this location";
            case GEOCODING_RATE_LIMITED -> "Geocoding request limit reached; try again later";
            case GEOCODING_UNAVAILABLE -> "Geocoding is temporarily unavailable";
            case GEOCODING_TIMEOUT -> "Geocoding provider timed out";
        };
        return ResponseEntity.status(status).body(new ApiError(exception.reason().name(), message));
    }
}

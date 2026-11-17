package dev.whereiparked.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

import dev.whereiparked.client.NominatimClient;
import dev.whereiparked.config.GeocodingProperties;
import dev.whereiparked.dto.LocationResponse;
import dev.whereiparked.dto.NominatimResponse;
import dev.whereiparked.exception.GeocodingException;
import org.springframework.stereotype.Service;

import static dev.whereiparked.exception.GeocodingException.Reason.*;

@Service
public class GeocodingService {
    private static final long INTERVAL_NANOS = Duration.ofSeconds(1).toNanos();
    private final NominatimClient client;
    private final LongSupplier ticker;
    private final long cacheTtlNanos;
    private final ReentrantLock requestLock = new ReentrantLock();
    private volatile CacheEntry cache;
    private boolean attempted;
    private long lastAttempt;

    public GeocodingService(NominatimClient client, GeocodingProperties properties, LongSupplier geocodingTicker) {
        this.client = client;
        this.ticker = geocodingTicker;
        this.cacheTtlNanos = properties.cacheTtl().toNanos();
    }

    public LocationResponse reverse(BigDecimal latitude, BigDecimal longitude) {
        LocationResponse cached = cached(latitude, longitude);
        if (cached != null) {
            return cached;
        }
        if (!requestLock.tryLock()) {
            throw new GeocodingException(GEOCODING_RATE_LIMITED);
        }
        try {
            cached = cached(latitude, longitude);
            if (cached != null) {
                return cached;
            }
            long now = ticker.getAsLong();
            if (attempted && now - lastAttempt < INTERVAL_NANOS) {
                throw new GeocodingException(GEOCODING_RATE_LIMITED);
            }
            attempted = true;
            lastAttempt = now;
            LocationResponse result = map(latitude, longitude, client.reverse(latitude, longitude));
            cache = new CacheEntry(result, ticker.getAsLong());
            return result;
        } finally {
            requestLock.unlock();
        }
    }

    private LocationResponse cached(BigDecimal latitude, BigDecimal longitude) {
        CacheEntry entry = cache;
        if (entry == null) {
            return null;
        }
        if (ticker.getAsLong() - entry.createdAt() >= cacheTtlNanos) {
            // Logical expiration: expired coordinates are never reused; replacement holds at most one entry.
            return null;
        }
        LocationResponse result = entry.response();
        if (result.latitude().compareTo(latitude) != 0 || result.longitude().compareTo(longitude) != 0) {
            return null;
        }
        return new LocationResponse(latitude, longitude, result.address(), result.street(), result.city(),
                result.state(), result.country());
    }

    private LocationResponse map(BigDecimal latitude, BigDecimal longitude, NominatimResponse source) {
        NominatimResponse.Address parts = source.address();
        String address = first(source.displayName());
        String street = parts == null ? null : first(parts.road(), parts.pedestrian(), parts.residential(),
                parts.footway(), parts.path());
        String city = parts == null ? null : first(parts.city(), parts.town(), parts.village(), parts.municipality());
        String state = parts == null ? null : first(parts.state());
        String country = parts == null ? null : first(parts.country());
        if (address == null && street == null && city == null && state == null && country == null) {
            throw new GeocodingException(ADDRESS_NOT_FOUND);
        }
        return new LocationResponse(latitude, longitude, address, street, city, state, country);
    }

    private static String first(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.strip();
            }
        }
        return null;
    }

    private record CacheEntry(LocationResponse response, long createdAt) {
    }
}

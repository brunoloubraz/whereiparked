package dev.whereiparked.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("geocoding")
public record GeocodingProperties(URI baseUrl, String userAgent, Duration connectTimeout,
        Duration readTimeout, Duration cacheTtl) {
    public GeocodingProperties {
        if (baseUrl == null || baseUrl.getHost() == null
                || !("https".equals(baseUrl.getScheme()) || "http".equals(baseUrl.getScheme()))
                || baseUrl.getUserInfo() != null || baseUrl.getQuery() != null || baseUrl.getFragment() != null) {
            throw new IllegalArgumentException("geocoding.base-url must be an HTTP(S) base URL");
        }
        if (connectTimeout == null || connectTimeout.isNegative() || connectTimeout.isZero()
                || readTimeout == null || readTimeout.isNegative() || readTimeout.isZero()
                || cacheTtl == null || cacheTtl.isNegative() || cacheTtl.isZero()) {
            throw new IllegalArgumentException("Geocoding timeouts and cache TTL must be positive");
        }
        userAgent = userAgent == null ? "" : userAgent.strip();
        if (userAgent.contains("\r") || userAgent.contains("\n")) {
            throw new IllegalArgumentException("Invalid geocoding user-agent");
        }
    }
}

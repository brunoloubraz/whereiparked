package dev.whereiparked.config;

import java.net.URI;
import java.time.Duration;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.*;

class GeocodingPropertiesTests {
    private static final URI BASE_URL = URI.create("https://provider.invalid");
    private static final Duration POSITIVE = Duration.ofSeconds(1);

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"/relative", "https:///reverse", "ftp://provider.invalid",
            "https://user:password@provider.invalid", "https://provider.invalid?query=value",
            "https://provider.invalid#fragment"})
    void rejectsUnsafeOrIncompleteBaseUrls(String url) {
        assertThatIllegalArgumentException().isThrownBy(() -> new GeocodingProperties(
                url == null ? null : URI.create(url), "", POSITIVE, POSITIVE, POSITIVE))
                .withMessage("geocoding.base-url must be an HTTP(S) base URL");
    }

    static Stream<Arguments> invalidDurations() {
        return Stream.of(null, Duration.ZERO, Duration.ofSeconds(-1)).flatMap(invalid -> Stream.of(
                Arguments.of(invalid, POSITIVE, POSITIVE),
                Arguments.of(POSITIVE, invalid, POSITIVE),
                Arguments.of(POSITIVE, POSITIVE, invalid)));
    }

    @ParameterizedTest
    @MethodSource("invalidDurations")
    void rejectsMissingOrNonPositiveTimeoutsAndTtl(Duration connect, Duration read, Duration ttl) {
        assertThatIllegalArgumentException().isThrownBy(() -> new GeocodingProperties(
                BASE_URL, "", connect, read, ttl))
                .withMessage("Geocoding timeouts and cache TTL must be positive");
    }

    @ParameterizedTest
    @ValueSource(strings = {"App\rInjected: value", "App\nInjected: value"})
    void rejectsHeaderInjection(String userAgent) {
        assertThatIllegalArgumentException().isThrownBy(() -> new GeocodingProperties(
                BASE_URL, userAgent, POSITIVE, POSITIVE, POSITIVE))
                .withMessage("Invalid geocoding user-agent");
    }

    @Test
    void acceptsHttpAndHttpsAndNormalizesOptionalIdentification() {
        for (String url : new String[] {"http://127.0.0.1:8080", "https://provider.invalid/reverse-api"}) {
            var properties = new GeocodingProperties(URI.create(url), "  WhereIParked/tests  ",
                    POSITIVE, POSITIVE, POSITIVE);
            assertThat(properties.baseUrl()).isEqualTo(URI.create(url));
            assertThat(properties.userAgent()).isEqualTo("WhereIParked/tests");
        }
        for (String userAgent : new String[] {null, "", "  "}) {
            assertThat(new GeocodingProperties(BASE_URL, userAgent, POSITIVE, POSITIVE, POSITIVE)
                    .userAgent()).isEmpty();
        }
    }
}

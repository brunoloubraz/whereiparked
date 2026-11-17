package dev.whereiparked.client;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.http.HttpConnectTimeoutException;
import java.time.Duration;
import java.util.stream.Stream;

import dev.whereiparked.config.GeocodingConfig;
import dev.whereiparked.config.GeocodingProperties;
import dev.whereiparked.exception.GeocodingException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.restclient.test.autoconfigure.RestClientTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static dev.whereiparked.exception.GeocodingException.Reason.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@RestClientTest(value = NominatimClient.class, properties = {
        "geocoding.base-url=https://provider.invalid",
        "geocoding.user-agent=WhereIParked/offline-tests (https://contact.invalid)"})
@Import(GeocodingConfig.class)
class NominatimClientTests {
    @Autowired NominatimClient client;
    @Autowired MockRestServiceServer server;
    @Autowired RestClient restClient;
    @Autowired org.springframework.boot.http.client.HttpClientSettings httpSettings;

    @Test void configuresFiniteTimeoutsAndDisablesRedirects() {
        assertThat(httpSettings.connectTimeout()).isEqualTo(Duration.ofSeconds(2));
        assertThat(httpSettings.readTimeout()).isEqualTo(Duration.ofSeconds(5));
        assertThat(httpSettings.redirects()).isEqualTo(org.springframework.boot.http.client.HttpRedirects.DONT_FOLLOW);
    }
    final BigDecimal lat = new BigDecimal("-23.5614");
    final BigDecimal lon = new BigDecimal("-46.6559");

    @AfterEach void verifyServer() { server.verify(); }

    private void expectRequest() {
        server.expect(requestTo("https://provider.invalid/reverse?lat=-23.5614&lon=-46.6559&format=jsonv2&addressdetails=1&accept-language=pt-BR"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("User-Agent", "WhereIParked/offline-tests (https://contact.invalid)"))
                .andRespond(withSuccess("""
                        {"lat":"99","lon":"99","display_name":"Brasil","address":{"country":"Brasil"},"extra":true}
                        """, MediaType.APPLICATION_JSON));
    }

    @Test void sendsRequiredParametersAndIdentifierAndIgnoresUnknownFields() {
        expectRequest();
        var response = client.reverse(lat, lon);
        assertThat(response.displayName()).isEqualTo("Brasil");
        assertThat(response.address().country()).isEqualTo("Brasil");
    }

    @ParameterizedTest @ValueSource(ints = {301, 400, 403, 429, 500, 502, 503})
    void mapsProviderErrorsWithoutRetry(int status) {
        server.expect(anything()).andRespond(withStatus(HttpStatus.valueOf(status))
                .body("private provider details").contentType(MediaType.APPLICATION_JSON));
        assertReason(GEOCODING_UNAVAILABLE);
    }

    @Test void sendsScientificNotationWithoutExpandingDecimalStrings() {
        server.expect(requestTo("https://provider.invalid/reverse?lat=1E-32&lon=0&format=jsonv2&addressdetails=1&accept-language=pt-BR"))
                .andRespond(withSuccess("{\"display_name\":\"Place\"}", MediaType.APPLICATION_JSON));
        assertThat(client.reverse(new BigDecimal("1e-32"), BigDecimal.ZERO).displayName()).isEqualTo("Place");
    }

    @Test void positiveExponentsDoNotIntroduceQuerySpaces() {
        server.expect(requestTo("https://provider.invalid/reverse?lat=1E1&lon=0E32&format=jsonv2&addressdetails=1&accept-language=pt-BR"))
                .andRespond(withSuccess("{\"display_name\":\"Place\"}", MediaType.APPLICATION_JSON));
        assertThat(client.reverse(new BigDecimal("1e1"), new BigDecimal("0e32")).displayName()).isEqualTo("Place");
    }

    @Test void mapsProviderNotFound() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertReason(ADDRESS_NOT_FOUND);
    }

    @ParameterizedTest @ValueSource(strings = {"", "{broken", "[]", "{\"error\":\"internal private details\"}"})
    void mapsInvalidResponses(String body) {
        server.expect(anything()).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        assertReason(GEOCODING_UNAVAILABLE);
    }

    @Test void recognizesDocumentedAbsence() {
        server.expect(anything()).andRespond(withSuccess("{\"error\":\"Unable to geocode\"}", MediaType.APPLICATION_JSON));
        assertReason(ADDRESS_NOT_FOUND);
    }

    static Stream<IOException> timeouts() {
        return Stream.of(new SocketTimeoutException("sensitive URL"), new HttpConnectTimeoutException("sensitive URL"));
    }

    @ParameterizedTest @MethodSource("timeouts")
    void mapsTimeouts(IOException exception) {
        server.expect(anything()).andRespond(withException(exception));
        assertReason(GEOCODING_TIMEOUT);
    }

    @Test void mapsTransportFailure() {
        server.expect(anything()).andRespond(withException(new IOException("sensitive URL")));
        assertReason(GEOCODING_UNAVAILABLE);
    }

    @Test void missingIdentificationPreventsAnyHttpRequest() {
        var unidentified = new NominatimClient(restClient, new GeocodingProperties(
                URI.create("https://provider.invalid"), "", Duration.ofSeconds(2),
                Duration.ofSeconds(5), Duration.ofMinutes(5)));
        assertThatThrownBy(() -> unidentified.reverse(lat, lon))
                .isInstanceOfSatisfying(GeocodingException.class,
                        error -> assertThat(error.reason()).isEqualTo(GEOCODING_UNAVAILABLE));
    }

    private void assertReason(GeocodingException.Reason reason) {
        assertThatThrownBy(() -> client.reverse(lat, lon)).isInstanceOfSatisfying(GeocodingException.class, error -> {
            assertThat(error.reason()).isEqualTo(reason);
            assertThat(error.getCause()).isNull();
            assertThat(error.getMessage()).isEqualTo(reason.name());
        });
    }
}

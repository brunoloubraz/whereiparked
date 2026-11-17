package dev.whereiparked;

import java.io.IOException;
import java.util.stream.Stream;
import java.net.SocketTimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.restclient.test.autoconfigure.AutoConfigureMockRestServiceServer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"geocoding.base-url=https://provider.invalid",
        "geocoding.user-agent=WhereIParked/offline-tests (https://contact.invalid)"})
@AutoConfigureMockMvc
@AutoConfigureMockRestServiceServer
class LocationApiTests {
    @Autowired MockMvc mvc;
    @Autowired MockRestServiceServer server;
    @MockitoBean LongSupplier geocodingTicker;
    // Each method gets a fresh monotonic interval while retaining the shared Spring context.
    private static final AtomicLong TIME = new AtomicLong();

    @BeforeEach void advanceTime() {
        long now = TIME.addAndGet(java.time.Duration.ofMinutes(10).toNanos());
        when(geocodingTicker.getAsLong()).thenReturn(now);
    }

    @Test void fullFlowPreservesInputCachesAndLimitsCalls() throws Exception {
        server.expect(anything()).andRespond(withSuccess("""
                {"lat":"1","lon":"2","display_name":"Avenida Paulista, Brasil",
                 "address":{"road":"Avenida Paulista","country":"Brasil"}}
                """, APPLICATION_JSON));
        mvc.perform(get("/api/location/reverse").param("lat", "-23.5614").param("lon", "-46.6559"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.latitude").value(-23.5614))
                .andExpect(jsonPath("$.longitude").value(-46.6559))
                .andExpect(jsonPath("$.street").value("Avenida Paulista"));
        mvc.perform(get("/api/location/reverse").param("lat", "-23.561400").param("lon", "-46.6559"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/location/reverse").param("lat", "0").param("lon", "0"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("GEOCODING_RATE_LIMITED"));
        server.verify();
    }

    @Test void noUsefulAddressReturns404() throws Exception {
        server.expect(anything()).andRespond(withSuccess("{\"address\":{}}", APPLICATION_JSON));
        requestError(404, "ADDRESS_NOT_FOUND");
    }

    @Test void transportFailureReturns503() throws Exception {
        server.expect(anything()).andRespond(withException(new IOException("private URL")));
        requestError(503, "GEOCODING_UNAVAILABLE");
    }

    @Test void timeoutReturns504() throws Exception {
        server.expect(anything()).andRespond(withException(new SocketTimeoutException("private URL")));
        requestError(504, "GEOCODING_TIMEOUT");
    }

    static Stream<String> incompatibleProviderText() {
        return Stream.of("123", "true", "{}", "[]").flatMap(value -> Stream.concat(
                Stream.of("{\"display_name\":" + value + "}", "{\"error\":" + value + "}"),
                Stream.of("road", "pedestrian", "residential", "footway", "path", "city", "town",
                        "village", "municipality", "state", "country")
                        .map(field -> "{\"display_name\":\"Valid text\",\"address\":{\"" + field + "\":" + value + "}}")));
    }

    @ParameterizedTest @MethodSource("incompatibleProviderText")
    void incompatibleProviderTextReturns503(String body) throws Exception {
        server.expect(anything()).andRespond(withSuccess(body, APPLICATION_JSON));
        requestError(503, "GEOCODING_UNAVAILABLE");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"display_name\":\"Brasil\"}",
            "{\"display_name\":\"Brasil\",\"address\":null,\"error\":null}",
            "{\"display_name\":null,\"address\":{\"road\":null,\"country\":\"Brasil\"}}",
            "{\"address\":{\"road\":null,\"pedestrian\":null,\"residential\":null,\"footway\":null,\"path\":null,\"city\":null,\"town\":null,\"village\":null,\"municipality\":null,\"state\":null,\"country\":\"Brasil\"}}"})
    void optionalMissingAndNullTextRemainValid(String body) throws Exception {
        server.expect(anything()).andRespond(withSuccess(body, APPLICATION_JSON));
        mvc.perform(get("/api/location/reverse").param("lat", "10").param("lon", "20"))
                .andExpect(status().isOk());
        server.verify();
    }

    private void requestError(int status, String code) throws Exception {
        mvc.perform(get("/api/location/reverse").param("lat", "10").param("lon", "20"))
                .andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
        server.verify();
    }
}

package dev.whereiparked.client;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import dev.whereiparked.dto.NominatimResponse;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises the production HTTP transport over loopback, not MockRestServiceServer. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource("classpath:geocoding-test.properties")
class NominatimTransportTests {
    private enum Mode { VALID, BEFORE_HEADERS, BODY_STALL, INVALID, DISCONNECT, ERROR, REDIRECT }

    private static HttpServer provider;
    private static ExecutorService executor;
    private static volatile Mode mode;
    private static volatile CountDownLatch release;
    private static final AtomicInteger calls = new AtomicInteger();
    private static final AtomicLong time = new AtomicLong();

    @Autowired MockMvc mvc;
    @Autowired RestClient nominatimRestClient;
    @MockitoBean LongSupplier geocodingTicker;

    @DynamicPropertySource
    static void providerProperties(DynamicPropertyRegistry registry) throws IOException {
        provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        provider.setExecutor(executor);
        provider.createContext("/", NominatimTransportTests::respond);
        provider.start();
        registry.add("geocoding.base-url", () -> "http://127.0.0.1:" + provider.getAddress().getPort());
        registry.add("geocoding.user-agent", () -> "WhereIParked/local-transport-test");
        registry.add("geocoding.connect-timeout", () -> "1s");
        registry.add("geocoding.read-timeout", () -> "1s");
    }

    @BeforeEach
    void resetProvider() {
        mode = Mode.VALID;
        release = new CountDownLatch(1);
        calls.set(0);
        when(geocodingTicker.getAsLong()).thenReturn(time.addAndGet(Duration.ofMinutes(10).toNanos()));
    }

    @AfterEach
    void releaseResponse() {
        release.countDown();
    }

    @AfterAll
    static void stopProvider() {
        if (provider != null) provider.stop(0);
        if (executor != null) executor.shutdownNow();
    }

    private static void respond(HttpExchange exchange) throws IOException {
        calls.incrementAndGet();
        Mode current = mode;
        CountDownLatch gate = release;
        try (exchange) {
            if (current == Mode.BEFORE_HEADERS) awaitRelease(gate);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            if (current == Mode.REDIRECT) {
                exchange.getResponseHeaders().set("Location", "/redirected");
                exchange.sendResponseHeaders(302, -1);
                return;
            }
            if (current == Mode.BODY_STALL || current == Mode.DISCONNECT) {
                // Advertise more bytes than the prefix, then either stall or close early.
                exchange.sendResponseHeaders(200, 128);
                exchange.getResponseBody().write("{\"display_name\":\"".getBytes(StandardCharsets.UTF_8));
                exchange.getResponseBody().flush();
                if (current == Mode.BODY_STALL) awaitRelease(gate);
                return;
            }
            byte[] body = (current == Mode.INVALID ? "{broken" : "{\"display_name\":\"Local address\"}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(current == Mode.ERROR ? 500 : 200, body.length);
            exchange.getResponseBody().write(body);
        }
        catch (IOException ignored) {
            // A timed-out client has already closed the connection; nothing to log.
        }
    }

    private static void awaitRelease(CountDownLatch gate) {
        try {
            if (!gate.await(10, TimeUnit.SECONDS)) throw new AssertionError("Response was not released");
        }
        catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void bodyReadRetainsTypedTimeoutCause() {
        mode = Mode.BODY_STALL;
        Throwable failure = catchThrowable(() -> nominatimRestClient.get().uri("/probe")
                .retrieve().body(NominatimResponse.class));
        assertThat(failure).isNotNull();
        List<Class<?>> causes = new ArrayList<>();
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) causes.add(cause.getClass());
        // Only exception classes from the loopback probe; no request URLs or coordinates.
        System.out.println("Stalled body exception types: " + causes);
        assertThat(causes).contains(SocketTimeoutException.class);
    }

    @Test
    void timeoutBeforeHeadersReturns504() throws Exception {
        mode = Mode.BEFORE_HEADERS;
        expectError(504, "GEOCODING_TIMEOUT");
    }

    @Test
    void timeoutDuringBodyReturns504() throws Exception {
        mode = Mode.BODY_STALL;
        expectError(504, "GEOCODING_TIMEOUT");
    }

    @Test
    void validJsonReturns200AndCacheAvoidsAnotherRequest() throws Exception {
        mvc.perform(get("/api/location/reverse").param("lat", "10").param("lon", "20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.address").value("Local address"));
        mvc.perform(get("/api/location/reverse").param("lat", "10.00").param("lon", "20.0"))
                .andExpect(status().isOk());
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void failureConsumesRateWindowWithoutRetry() throws Exception {
        mode = Mode.ERROR;
        expectError(503, "GEOCODING_UNAVAILABLE");
        expectError(429, "GEOCODING_RATE_LIMITED");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void invalidJsonReturns503() throws Exception {
        mode = Mode.INVALID;
        expectError(503, "GEOCODING_UNAVAILABLE");
    }

    @Test
    void prematureConnectionCloseReturns503() throws Exception {
        mode = Mode.DISCONNECT;
        expectError(503, "GEOCODING_UNAVAILABLE");
    }

    @Test
    void providerErrorReturns503() throws Exception {
        mode = Mode.ERROR;
        expectError(503, "GEOCODING_UNAVAILABLE");
    }

    @Test
    void redirectsAreNotFollowed() throws Exception {
        mode = Mode.REDIRECT;
        expectError(503, "GEOCODING_UNAVAILABLE");
        assertThat(calls.get()).isEqualTo(1);
    }

    private void expectError(int expectedStatus, String code) throws Exception {
        mvc.perform(get("/api/location/reverse").param("lat", "10").param("lon", "20"))
                .andExpect(status().is(expectedStatus)).andExpect(jsonPath("$.code").value(code));
    }
}

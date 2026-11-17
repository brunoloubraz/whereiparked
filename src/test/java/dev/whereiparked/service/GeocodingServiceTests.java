package dev.whereiparked.service;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import dev.whereiparked.client.NominatimClient;
import dev.whereiparked.config.GeocodingProperties;
import dev.whereiparked.dto.NominatimResponse;
import dev.whereiparked.exception.GeocodingException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static dev.whereiparked.exception.GeocodingException.Reason.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GeocodingServiceTests {
    NominatimClient client;
    AtomicLong time;
    GeocodingService service;
    final BigDecimal lat = new BigDecimal("-23.5614");
    final BigDecimal lon = new BigDecimal("-46.6559");

    @BeforeEach
    void setUp() {
        client = mock(NominatimClient.class);
        time = new AtomicLong();
        service = new GeocodingService(client, new GeocodingProperties(URI.create("https://provider.invalid"),
                "WhereIParked/tests", Duration.ofSeconds(2), Duration.ofSeconds(5), Duration.ofMinutes(5)), time::get);
        when(client.reverse(any(), any())).thenReturn(new NominatimResponse(" Place ", null, null));
    }

    @Test
    void preservesInputAndDoesNotInventMissingComponents() {
        var result = service.reverse(lat, lon);
        assertThat(result.latitude()).isEqualTo(lat);
        assertThat(result.longitude()).isEqualTo(lon);
        assertThat(result.address()).isEqualTo("Place");
        assertThat(result.street()).isNull();
        assertThat(result.city()).isNull();
        assertThat(result.state()).isNull();
        assertThat(result.country()).isNull();
    }

    @ParameterizedTest
    @CsvSource({"Road,Pedestrian,Residential,Footway,Path,City,Town,Village,Municipality,Road,City",
            "'',Pedestrian,Residential,Footway,Path,'',Town,Village,Municipality,Pedestrian,Town",
            "'','',Residential,Footway,Path,'','',Village,Municipality,Residential,Village",
            "'','','',Footway,Path,'','','',Municipality,Footway,Municipality",
            "'','','','',Path,'','','',Municipality,Path,Municipality"})
    void mapsFallbacks(String road, String pedestrian, String residential, String footway, String path,
            String city, String town, String village, String municipality, String street, String settlement) {
        when(client.reverse(any(), any())).thenReturn(new NominatimResponse(" ",
                new NominatimResponse.Address(road, pedestrian, residential, footway, path,
                        city, town, village, municipality, " State ", "Country"), null));
        var result = service.reverse(lat, lon);
        assertThat(result.street()).isEqualTo(street);
        assertThat(result.city()).isEqualTo(settlement);
        assertThat(result.state()).isEqualTo("State");
        assertThat(result.country()).isEqualTo("Country");
        assertThat(result.address()).isNull();
    }

    @Test
    void noUsefulAddressIsNotCached() {
        when(client.reverse(any(), any())).thenReturn(new NominatimResponse(" ", null, null));
        assertReason(() -> service.reverse(lat, lon), ADDRESS_NOT_FOUND);
        time.addAndGet(Duration.ofSeconds(1).toNanos());
        assertReason(() -> service.reverse(lat, lon), ADDRESS_NOT_FOUND);
        verify(client, times(2)).reverse(lat, lon);
    }

    @Test
    void cachePrecedesLimitAndUsesNumericEqualityButPreservesCurrentInput() {
        service.reverse(lat, lon);
        var result = service.reverse(new BigDecimal("-23.561400"), lon);
        assertThat(result.latitude()).isEqualTo(new BigDecimal("-23.561400"));
        verify(client).reverse(lat, lon);
        assertReason(() -> service.reverse(BigDecimal.ZERO, lon), GEOCODING_RATE_LIMITED);
        verifyNoMoreInteractions(client);
    }

    @Test
    void expiresAndReplacesSingleEntryWithoutRounding() {
        service.reverse(lat, lon);
        time.addAndGet(Duration.ofMinutes(5).toNanos());
        service.reverse(lat, lon);
        time.addAndGet(Duration.ofSeconds(1).toNanos());
        service.reverse(lat.add(new BigDecimal("0.00000001")), lon);
        time.addAndGet(Duration.ofSeconds(1).toNanos());
        service.reverse(lat, lon);
        verify(client, times(3)).reverse(lat, lon);
        verify(client).reverse(lat.add(new BigDecimal("0.00000001")), lon);
    }

    @Test
    void failedCallsConsumeRateWindowAndAreNotRetried() {
        when(client.reverse(any(), any())).thenThrow(new GeocodingException(GEOCODING_UNAVAILABLE));
        assertReason(() -> service.reverse(lat, lon), GEOCODING_UNAVAILABLE);
        assertReason(() -> service.reverse(lat, lon), GEOCODING_RATE_LIMITED);
        verify(client).reverse(lat, lon);
        time.addAndGet(Duration.ofSeconds(1).toNanos());
        assertReason(() -> service.reverse(lat, lon), GEOCODING_UNAVAILABLE);
        verify(client, times(2)).reverse(lat, lon);
    }

    @Test
    void concurrentRequestsAreRejectedWithoutQueueButExistingCacheRemainsAvailable() throws Exception {
        service.reverse(lat, lon);
        time.addAndGet(Duration.ofSeconds(1).toNanos());
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(client.reverse(BigDecimal.ZERO, lon)).thenAnswer(call -> {
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Test latch timed out");
            return new NominatimResponse("Other", null, null);
        });
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> service.reverse(BigDecimal.ZERO, lon));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertReason(() -> service.reverse(BigDecimal.ONE, lon), GEOCODING_RATE_LIMITED);
                assertThat(service.reverse(lat, lon).address()).isEqualTo("Place");
            } finally {
                release.countDown();
            }
            assertThat(pending.get(5, TimeUnit.SECONDS).address()).isEqualTo("Other");
        }
        verify(client, times(2)).reverse(any(), any());
    }

    private static void assertReason(org.assertj.core.api.ThrowableAssert.ThrowingCallable action,
            GeocodingException.Reason reason) {
        assertThatThrownBy(action).isInstanceOfSatisfying(GeocodingException.class,
                exception -> assertThat(exception.reason()).isEqualTo(reason));
    }
}

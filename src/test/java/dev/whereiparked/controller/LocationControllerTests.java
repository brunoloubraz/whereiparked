package dev.whereiparked.controller;

import java.math.BigDecimal;
import java.util.stream.Stream;

import dev.whereiparked.dto.LocationResponse;
import dev.whereiparked.exception.GeocodingException;
import dev.whereiparked.exception.GeocodingException.Reason;
import dev.whereiparked.service.GeocodingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LocationController.class)
class LocationControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean GeocodingService service;

    @Test
    void returnsOriginalCoordinatesAndExplicitNulls() throws Exception {
        when(service.reverse(any(), any())).thenAnswer(call -> new LocationResponse(
                call.getArgument(0), call.getArgument(1), "Brasil", null, null, null, "Brasil"));
        mvc.perform(get("/api/location/reverse").param("lat", "-23.5614").param("lon", "-46.6559"))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"latitude":-23.5614,"longitude":-46.6559,"address":"Brasil",
                         "street":null,"city":null,"state":null,"country":"Brasil"}
                        """));
    }

    static Stream<Arguments> invalidCoordinates() {
        return Stream.of(Arguments.of(null, "0"), Arguments.of("0", null),
                Arguments.of("", "0"), Arguments.of("0", ""), Arguments.of(" ", "0"),
                Arguments.of("-90.0001", "0"), Arguments.of("90.0001", "0"),
                Arguments.of("0", "-180.0001"), Arguments.of("0", "180.0001"),
                Arguments.of("abc", "0"), Arguments.of("0", "abc"),
                Arguments.of("NaN", "0"), Arguments.of("0", "NaN"),
                Arguments.of("Infinity", "0"), Arguments.of("0", "Infinity"),
                Arguments.of("-Infinity", "0"), Arguments.of("0", "-Infinity"));
    }

    @ParameterizedTest @MethodSource("invalidCoordinates")
    void rejectsInvalidInputWithoutCallingService(String lat, String lon) throws Exception {
        var request = get("/api/location/reverse");
        if (lat != null) request.param("lat", lat);
        if (lon != null) request.param("lon", lon);
        mvc.perform(request).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_COORDINATES"))
                .andExpect(jsonPath("$.message").value("Latitude must be between -90 and 90 and longitude between -180 and 180"));
        verifyNoInteractions(service);
    }

    @ParameterizedTest @MethodSource("boundaries")
    void acceptsInclusiveBoundaries(String lat, String lon) throws Exception {
        when(service.reverse(any(), any())).thenReturn(new LocationResponse(
                new BigDecimal(lat), new BigDecimal(lon), "Place", null, null, null, null));
        mvc.perform(get("/api/location/reverse").param("lat", lat).param("lon", lon))
                .andExpect(status().isOk());
        verify(service).reverse(new BigDecimal(lat), new BigDecimal(lon));
    }

    static Stream<Arguments> boundaries() {
        return Stream.of(Arguments.of("-90", "-180"), Arguments.of("90", "180"), Arguments.of("0", "0"));
    }

    static Stream<Arguments> extremeCoordinates() {
        return Stream.of("1e-2147483647", "1e2147483647", "0e-2147483647", "0e2147483647",
                "1e-33", "0e33", "0." + "0".repeat(63), "0".repeat(65))
                .flatMap(value -> Stream.of(Arguments.of(value, "0"), Arguments.of("0", value)));
    }

    @ParameterizedTest @MethodSource("extremeCoordinates")
    void rejectsExtremeFormatsBeforeCallingService(String lat, String lon) throws Exception {
        mvc.perform(get("/api/location/reverse").param("lat", lat).param("lon", lon))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_COORDINATES"));
        verifyNoInteractions(service);
    }

    static Stream<Arguments> supportedFormats() {
        return Stream.of(Arguments.of("1e-32", "-1e-32"), Arguments.of("0e32", "0e-32"), Arguments.of("1e1", "-1e2"),
                Arguments.of("-2.35614e1", "-46.655900"),
                Arguments.of("0." + "0".repeat(29) + "123", "0"),
                Arguments.of("0".repeat(63) + "1", "0"));
    }

    @ParameterizedTest @MethodSource("supportedFormats")
    void preservesSupportedDecimalsWithoutRounding(String lat, String lon) throws Exception {
        when(service.reverse(any(), any())).thenReturn(new LocationResponse(
                new BigDecimal(lat), new BigDecimal(lon), "Place", null, null, null, null));
        mvc.perform(get("/api/location/reverse").param("lat", lat).param("lon", lon))
                .andExpect(status().isOk());
        verify(service).reverse(new BigDecimal(lat), new BigDecimal(lon));
    }

    @ParameterizedTest @EnumSource(Reason.class)
    void mapsDomainErrors(Reason reason) throws Exception {
        when(service.reverse(any(), any())).thenThrow(new GeocodingException(reason));
        int status = switch (reason) {
            case ADDRESS_NOT_FOUND -> 404;
            case GEOCODING_RATE_LIMITED -> 429;
            case GEOCODING_UNAVAILABLE -> 503;
            case GEOCODING_TIMEOUT -> 504;
        };
        mvc.perform(get("/api/location/reverse").param("lat", "12.34567").param("lon", "45.67891"))
                .andExpect(status().is(status))
                .andExpect(jsonPath("$.code").value(reason.name()))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("12.34567"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("nominatim"))));
    }
}

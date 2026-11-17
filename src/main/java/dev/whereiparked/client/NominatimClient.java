package dev.whereiparked.client;

import java.math.BigDecimal;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;

import dev.whereiparked.config.GeocodingProperties;
import dev.whereiparked.dto.NominatimResponse;
import dev.whereiparked.exception.GeocodingException;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import static dev.whereiparked.exception.GeocodingException.Reason.*;

@Component
public class NominatimClient {
    private final RestClient restClient;
    private final GeocodingProperties properties;

    public NominatimClient(RestClient nominatimRestClient, GeocodingProperties properties) {
        this.restClient = nominatimRestClient;
        this.properties = properties;
    }

    public NominatimResponse reverse(BigDecimal latitude, BigDecimal longitude) {
        // Allow the static site to start without a contact, but never send unidentified requests.
        if (properties.userAgent().isBlank()) {
            throw new GeocodingException(GEOCODING_UNAVAILABLE);
        }
        try {
            NominatimResponse response = restClient.get()
                    .uri(builder -> builder.path("/reverse")
                            .queryParam("lat", latitude.toPlainString())
                            .queryParam("lon", longitude.toPlainString())
                            .queryParam("format", "jsonv2")
                            .queryParam("addressdetails", "1")
                            .queryParam("accept-language", "pt-BR").build())
                    .header(HttpHeaders.USER_AGENT, properties.userAgent())
                    .retrieve()
                    .onStatus(status -> !status.is2xxSuccessful(), (request, result) -> {
                        if (result.getStatusCode().value() == 404) {
                            throw new GeocodingException(ADDRESS_NOT_FOUND);
                        }
                        throw new GeocodingException(GEOCODING_UNAVAILABLE);
                    })
                    .body(NominatimResponse.class);
            if (response == null) {
                throw new GeocodingException(GEOCODING_UNAVAILABLE);
            }
            if (response.error() != null) {
                // Only the documented absence message is recognized; never expose provider text.
                if ("Unable to geocode".equals(response.error())) {
                    throw new GeocodingException(ADDRESS_NOT_FOUND);
                }
                throw new GeocodingException(GEOCODING_UNAVAILABLE);
            }
            return response;
        } catch (RestClientException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException) {
                    throw new GeocodingException(GEOCODING_TIMEOUT);
                }
            }
            throw new GeocodingException(GEOCODING_UNAVAILABLE);
        }
    }
}

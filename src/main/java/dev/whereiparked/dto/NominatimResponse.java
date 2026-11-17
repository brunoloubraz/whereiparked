package dev.whereiparked.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record NominatimResponse(@JsonProperty("display_name") String displayName, Address address,
        String error) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Address(String road, String pedestrian, String residential, String footway,
            String path, String city, String town, String village, String municipality,
            String state, String country) {
    }
}

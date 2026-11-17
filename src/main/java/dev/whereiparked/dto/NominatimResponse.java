package dev.whereiparked.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.annotation.JsonDeserialize;

@JsonIgnoreProperties(ignoreUnknown = true)
public record NominatimResponse(
        @JsonProperty("display_name") @JsonDeserialize(using = StrictTextDeserializer.class) String displayName,
        Address address,
        @JsonDeserialize(using = StrictTextDeserializer.class) String error) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Address(
            @JsonDeserialize(using = StrictTextDeserializer.class) String road,
            @JsonDeserialize(using = StrictTextDeserializer.class) String pedestrian,
            @JsonDeserialize(using = StrictTextDeserializer.class) String residential,
            @JsonDeserialize(using = StrictTextDeserializer.class) String footway,
            @JsonDeserialize(using = StrictTextDeserializer.class) String path,
            @JsonDeserialize(using = StrictTextDeserializer.class) String city,
            @JsonDeserialize(using = StrictTextDeserializer.class) String town,
            @JsonDeserialize(using = StrictTextDeserializer.class) String village,
            @JsonDeserialize(using = StrictTextDeserializer.class) String municipality,
            @JsonDeserialize(using = StrictTextDeserializer.class) String state,
            @JsonDeserialize(using = StrictTextDeserializer.class) String country) {
    }
}

package dev.whereiparked.dto;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record LocationResponse(BigDecimal latitude, BigDecimal longitude, String address,
        String street, String city, String state, String country) {
}

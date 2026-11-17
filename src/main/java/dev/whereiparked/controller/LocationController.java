package dev.whereiparked.controller;

import java.math.BigDecimal;

import dev.whereiparked.dto.LocationResponse;
import dev.whereiparked.service.GeocodingService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LocationController {
    private final GeocodingService service;

    public LocationController(GeocodingService service) {
        this.service = service;
    }

    @GetMapping("/api/location/reverse")
    public LocationResponse reverse(
            @RequestParam @DecimalMin("-90") @DecimalMax("90") BigDecimal lat,
            @RequestParam @DecimalMin("-180") @DecimalMax("180") BigDecimal lon) {
        return service.reverse(lat, lon);
    }
}

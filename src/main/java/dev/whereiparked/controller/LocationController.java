package dev.whereiparked.controller;

import java.beans.PropertyEditorSupport;
import java.math.BigDecimal;

import dev.whereiparked.dto.LocationResponse;
import dev.whereiparked.service.GeocodingService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LocationController {
    private final GeocodingService service;

    public LocationController(GeocodingService service) {
        this.service = service;
    }

    @InitBinder
    void coordinateBinding(WebDataBinder binder) {
        binder.registerCustomEditor(BigDecimal.class, new PropertyEditorSupport() {
            @Override
            public void setAsText(String text) {
                // Bound work before parsing, comparing ranges or formatting decimal strings.
                if (text == null || text.length() > 64) {
                    throw new IllegalArgumentException("Unsupported coordinate format");
                }
                BigDecimal value = new BigDecimal(text.strip());
                if (value.scale() < -32 || value.scale() > 32) {
                    throw new IllegalArgumentException("Unsupported coordinate scale");
                }
                setValue(value);
            }
        });
    }

    @GetMapping("/api/location/reverse")
    public LocationResponse reverse(
            @RequestParam @DecimalMin("-90") @DecimalMax("90") BigDecimal lat,
            @RequestParam @DecimalMin("-180") @DecimalMax("180") BigDecimal lon) {
        return service.reverse(lat, lon);
    }
}

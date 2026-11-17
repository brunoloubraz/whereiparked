package dev.whereiparked.config;

import java.util.function.LongSupplier;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.HttpClientSettings;
import org.springframework.boot.http.client.HttpRedirects;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(GeocodingProperties.class)
public class GeocodingConfig {
    @Bean
    ClientHttpRequestFactoryBuilder<?> geocodingRequestFactoryBuilder() {
        return ClientHttpRequestFactoryBuilder.jdk();
    }

    @Bean
    HttpClientSettings geocodingHttpSettings(GeocodingProperties properties) {
        return HttpClientSettings.defaults()
                .withTimeouts(properties.connectTimeout(), properties.readTimeout())
                .withRedirects(HttpRedirects.DONT_FOLLOW);
    }

    @Bean
    RestClient nominatimRestClient(RestClient.Builder builder, GeocodingProperties properties) {
        // Let Boot configure the transport so test customizers can replace it entirely.
        return builder.baseUrl(properties.baseUrl().toString()).build();
    }

    @Bean
    LongSupplier geocodingTicker() {
        return System::nanoTime;
    }
}

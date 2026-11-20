package dev.whereiparked;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource("classpath:geocoding-test.properties")
class WhereiparkedApplicationTests {

	@Test
	void contextLoads() {
	}

}

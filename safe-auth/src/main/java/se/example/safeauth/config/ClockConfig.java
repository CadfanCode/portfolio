package se.example.safeauth.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Supplies the one clock the whole service reads time from.
 *
 * <p>It exists so that nothing in pki/, card/ or token/ ever calls {@code Instant.now()}
 * itself. Certificate validity windows and token expiry are both comparisons against the
 * current time, and code that reads the system clock directly can only be tested by
 * sleeping through the interesting moment. With the clock injected, a test hands in
 * {@code Clock.fixed(...)}, stands a year in the future, and watches a certificate expire
 * in no time at all.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        // UTC rather than the host's zone. Every timestamp this service puts in a token is
        // an epoch second, and where the machine happens to sit should never come into it.
        return Clock.systemUTC();
    }
}

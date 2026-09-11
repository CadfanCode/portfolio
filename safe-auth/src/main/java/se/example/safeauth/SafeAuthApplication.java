package se.example.safeauth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Entry point. All wiring lives in the config package; nothing is configured here. */
@SpringBootApplication
public class SafeAuthApplication {
    public static void main(String[] args) {
        SpringApplication.run(SafeAuthApplication.class, args);
    }
}

package se.example.safeauth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Lets a browser front end on another origin call this API.
 *
 * <p>CORS is a browser rule, not a server defence. It decides which web pages may read a
 * response, and it stops nothing that is not a browser — curl ignores it entirely. So
 * widening this list does not weaken the token checks; it only decides who may be told
 * the answer by a script.
 *
 * <p><strong>The trap, and the reason this file exists.</strong> The pattern below has a
 * wildcard port, {@code http://localhost:*}. That is legal in
 * {@link CorsRegistry#addMapping} only via {@code allowedOriginPatterns}. Pass it to
 * {@code allowedOrigins} instead and it is not treated as a pattern at all — it is
 * compared as a literal origin string, never matches any real one, and the request is
 * refused with no error anywhere in the server log. You see a CORS failure in the browser
 * console and nothing at all on this side. Two method names that read as synonyms, one of
 * which quietly does nothing with the value you gave it.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOriginPatterns;

    /** Comma-separated in the yaml; Spring splits it into the array for us. */
    public CorsConfig(
            @Value("${safe-auth.cors.allowed-origin-patterns:http://localhost:*}") String[] allowedOriginPatterns) {
        this.allowedOriginPatterns = allowedOriginPatterns;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // GET and POST only, because those are the only verbs this API has. Listing the
        // headers explicitly rather than allowing "*" is the same habit as everywhere
        // else here: name what is permitted, never what is forbidden.
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST")
                .allowedHeaders("Authorization", "Content-Type");

        // The JWK set needs the same treatment: a front end that verifies a token in the
        // browser fetches it from here, and that fetch is cross-origin too.
        registry.addMapping("/.well-known/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET")
                .allowedHeaders("Authorization", "Content-Type");
    }
}

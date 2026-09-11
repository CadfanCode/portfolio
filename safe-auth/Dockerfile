# Two-stage build: compile with the JDK, ship only the JRE.
#
# safe-auth holds no state on disk — the CA is generated in memory at boot — so the
# container is genuinely disposable. That also means every restart mints a brand-new
# root CA and invalidates every certificate it previously issued, which is fine here
# because the front end fetches a card's PEM at tap time rather than caching it.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Copy the POM alone first so dependency resolution is cached as its own layer and is
# not redone every time a source file changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app

# Run as a non-root user. Nothing here needs root, and a container process that cannot
# write outside its own workspace is one less thing to reason about.
RUN useradd --system --uid 10001 safeauth
USER safeauth

COPY --from=build /build/target/safe-auth-0.1.0.jar app.jar

EXPOSE 8080

# Container platforms set PORT; Spring reads SERVER_PORT. Bridge the two so the same
# image runs unchanged on Fly, Cloud Run or Render.
ENV SERVER_PORT=8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]

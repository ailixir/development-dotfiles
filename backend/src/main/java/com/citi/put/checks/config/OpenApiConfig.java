package com.citi.put.checks.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("!worker")
public class OpenApiConfig {

  @Bean
  public OpenAPI checksOpenApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("PUT Checks API")
                .version("1.0.0")
                .description("Production Unified Toolkit — Checks backend service"))
        .addSecurityItem(new SecurityRequirement().addList("CookieAuth"))
        .components(
            new Components()
                .addSecuritySchemes(
                    "CookieAuth",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.COOKIE)
                        .name("put_session")));
  }
}

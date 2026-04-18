package com.citi.put.checks;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class ChecksApplication {

  public static void main(String[] args) {
    SpringApplication.run(ChecksApplication.class, args);
  }
}

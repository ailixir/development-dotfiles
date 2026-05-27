package com.citi.put.checks.users;

import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.users.dto.UserDto;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/users")
public class UsersController {

  private final UserRepository userRepository;

  public UsersController(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @GetMapping("/me")
  public ResponseEntity<UserDto> me(@AuthenticationPrincipal UserIdentity identity) {
    return userRepository
        .findBySsoId(identity.userId())
        .map(user -> ResponseEntity.ok(UserDto.from(user)))
        .orElseGet(
            () -> {
              HttpHeaders headers = new HttpHeaders();
              headers.set("Retry-After", "2");
              return new ResponseEntity<>(null, headers, HttpStatus.NOT_FOUND);
            });
  }
}

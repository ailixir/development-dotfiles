package com.citi.put.checks.tags;

import com.citi.put.checks.tags.dto.TagSuggestionsRequest;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/tags")
public class TagsController {

  private final TagsService tagsService;

  public TagsController(TagsService tagsService) {
    this.tagsService = tagsService;
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(@RequestParam(required = false) String csi) {
    return ResponseEntity.ok(tagsService.listTags(csi));
  }

  @GetMapping("/stats")
  public ResponseEntity<Map<String, Object>> stats(@RequestParam(required = false) String csi) {
    return ResponseEntity.ok(tagsService.tagStats(csi));
  }

  @PostMapping("/suggestions")
  public ResponseEntity<Map<String, Object>> suggestions(
      @RequestBody TagSuggestionsRequest request) {
    return ResponseEntity.ok(tagsService.suggestions(request));
  }
}

package com.citi.put.checks.templates;

import com.citi.put.checks.templates.dto.CheckTemplateDto;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/check-templates")
public class TemplatesController {

  private final TemplatesService templatesService;

  public TemplatesController(TemplatesService templatesService) {
    this.templatesService = templatesService;
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(
      @RequestParam(required = false) String q, @RequestParam(required = false) String type) {
    List<CheckTemplateDto> templates = templatesService.list(q, type);
    return ResponseEntity.ok(Map.of("data", templates, "total", templates.size()));
  }

  @GetMapping("/{id}")
  public ResponseEntity<CheckTemplateDto> findById(@PathVariable String id) {
    CheckTemplateDto dto = templatesService.findById(id);
    return ResponseEntity.ok(dto);
  }
}

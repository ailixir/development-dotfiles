package com.citi.put.checks.templates;

import com.citi.put.checks.templates.dto.CheckTemplateDto;
import com.citi.put.checks.templates.entity.CheckTemplate;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TemplatesService {

  private final TemplatesRepository templatesRepository;

  public TemplatesService(TemplatesRepository templatesRepository) {
    this.templatesRepository = templatesRepository;
  }

  public List<CheckTemplateDto> list(String search, String type) {
    String searchPattern = search != null ? "%" + search.toLowerCase() + "%" : null;
    List<CheckTemplate> templates = templatesRepository.findAllFiltered(type, searchPattern);
    return templates.stream().map(CheckTemplateDto::from).collect(Collectors.toList());
  }

  public CheckTemplateDto findById(String id) {
    CheckTemplate template =
        templatesRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Template not found: " + id));
    return CheckTemplateDto.from(template);
  }
}

package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import java.util.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Searchable, sortable draft listing (Story 10.46). */
public interface StudioRepositoryCustom {

  /**
   * One page of visible drafts matching {@code query}, ordered by its sort and then by id.
   *
   * <p>{@code readableCsiIds} is the caller's scope and is applied in the same query as the
   * filters, before paging, so page counts never describe rows the caller cannot read (AC-14,
   * Architecture §9.1). {@code null} means unrestricted; it is never inferred from an empty
   * collection, which the caller answers with an empty page instead.
   *
   * <p>Deleted and quarantined drafts are excluded by the {@code &#64;SQLRestriction} on {@link
   * UITest}, exactly as for every other entity query.
   *
   * @param query validated filters and sort; its {@code pageable} sort is ignored
   * @param readableCsiIds the caller's scope, or null when unrestricted
   * @param pageable page number and size only
   * @return the page
   */
  Page<UITest> findPage(
      StudioListQuery.Tests query, Collection<String> readableCsiIds, Pageable pageable);
}

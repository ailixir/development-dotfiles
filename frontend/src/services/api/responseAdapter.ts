import type { ApiResponse } from '../../types/common/commonTypes';


export function normalizePageResponse<T>(raw: any): ApiResponse<T[]> {
  if (!raw) return raw;

  // Spring Page format: {content, number, size, totalElements, totalPages}
  if (raw.content !== undefined) {
    return {
      data: raw.content,
      page: raw.number + 1,
      limit: raw.size,
      total: raw.totalElements,
      totalPages: raw.totalPages,
    };
  }

  // BE custom envelope: {data, page (0-based), size, totalElements, totalPages}
  if (raw.data !== undefined && raw.totalElements !== undefined) {
    return {
      data: raw.data,
      page: (raw.page ?? 0) + 1,
      limit: raw.size,
      total: raw.totalElements,
      totalPages: raw.totalPages,
    };
  }

  // Already in FE format or non-paged response
  return raw;
}

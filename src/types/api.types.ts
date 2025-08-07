// Standard API response wrapper
export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
  timestamp: string;
}

// Paginated response
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Error response
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Common query parameters
export interface QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

// API endpoints
export interface ApiEndpoints {
  checks: string;
  csi: string;
  execution: string;
  reports: string;
  studio: string;
}

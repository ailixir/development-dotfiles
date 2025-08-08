export interface Tag {
  name: string;
  category?: string;
  description?: string;
  color?: string;
}

export interface TagStats {
  tag: string;
  count: number;
  percentage?: number;
}

export interface TagFilters {
  category?: string;
  searchQuery?: string;
  csiId?: string;
}

export interface TagSuggestion {
  tag: string;
  relevanceScore: number;
  reason: string;
}

// API Response types
export interface TagListResponse {
  data: string[];
  total: number;
  csiId?: string;
  timestamp: string;
}

export interface TagStatsResponse {
  data: TagStats[];
  totalTags: number;
  totalChecks: number;
  csiId?: string;
  timestamp: string;
}

export interface TagSuggestionsResponse {
  data: string[];
  selectedTags: string[];
  csiId?: string;
  timestamp: string;
}
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { APP_CONFIG } from '@utils/constants/appConfig';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: APP_CONFIG.apiBaseUrl,
      timeout: 30000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add authentication token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log requests in development
        if (APP_CONFIG.debugMode) {
          console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log responses in development
        if (APP_CONFIG.debugMode) {
          console.log(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            status: response.status,
            data: response.data,
          });
        }

        return response;
      },
      async (error) => {
        // Log errors
        console.error('API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });

        // Handle common error cases
        if (error.response?.status === 401) {
          // Handle unauthorized - could redirect to login
          console.warn('Unauthorized access - token may be expired');
        } else if (error.response?.status === 403) {
          // Handle forbidden
          console.warn('Access forbidden - insufficient permissions');
        } else if (error.response?.status >= 500) {
          // Handle server errors
          console.error('Server error - check service status');
        }

        // Lightweight retry/backoff for idempotent GET requests
        const originalConfig = error.config as (AxiosRequestConfig & { __retryCount?: number; __doNotRetry?: boolean });
        const shouldRetry = !originalConfig?.__doNotRetry && (originalConfig?.method || 'get').toLowerCase() === 'get';
        const retriableStatus = !error.response || (error.response.status >= 500 && error.response.status < 600);
        if (shouldRetry && retriableStatus) {
          originalConfig.__retryCount = (originalConfig.__retryCount || 0) + 1;
          const maxRetries = 2;
          if (originalConfig.__retryCount <= maxRetries) {
            const delayMs = Math.min(1500, 200 * Math.pow(2, originalConfig.__retryCount - 1));
            await new Promise((r) => setTimeout(r, delayMs));
            return this.instance.request(originalConfig);
          }
        }

        // Normalize error message shape
        const normalized = new Error(
          error.response?.data?.error || error.response?.data?.message || error.message || 'Request failed'
        );
        // Preserve response for callers who need it
        (normalized as any).response = error.response;
        return Promise.reject(normalized);
      }
    );
  }

  private getAuthToken(): string | null {
    // In a real application, this would get the token from auth context or storage
    return null;
  }

  // HTTP methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete(url, config);
    return response.data;
  }

  // Utility methods
  getBaseURL(): string {
    return this.instance.defaults.baseURL || '';
  }

  setTimeout(timeout: number): void {
    this.instance.defaults.timeout = timeout;
  }

  setAuthToken(token: string): void {
    this.instance.defaults.headers.Authorization = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.instance.defaults.headers.Authorization;
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();
export default apiClient;

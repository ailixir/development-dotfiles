import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { APP_CONFIG } from '@utils/constants/appConfig';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: APP_CONFIG.apiBaseUrl,
      timeout: 30000,
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

        // Inject MSW debug params for development scenarios
        try {
          const isDev = typeof window !== 'undefined' && (import.meta as any).env?.DEV;
          if (isDev) {
            const slow = window.localStorage.getItem('__msw_debug_slow');
            const fail = window.localStorage.getItem('__msw_debug_fail');
            const empty = window.localStorage.getItem('__msw_debug_empty');
            if (slow || fail || empty) {
              // Normalize params to object
              let paramsObj: Record<string, any> = {};
              if (config.params instanceof URLSearchParams) {
                config.params.forEach((value, key) => {
                  paramsObj[key] = value;
                });
              } else if (typeof config.params === 'object' && config.params !== null) {
                paramsObj = { ...config.params } as Record<string, any>;
              }
              if (slow && !Number.isNaN(Number(slow))) paramsObj.__slow = slow;
              if (fail && !Number.isNaN(Number(fail))) paramsObj.__fail = fail;
              if (empty === '1' || empty === 'true') paramsObj.__empty = '1';
              config.params = paramsObj;
            }
          }
        } catch {
          // no-op if localStorage not available
        }

        // Log requests in development
        if (APP_CONFIG.debugMode) {
          console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
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
          console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            status: response.status,
            data: response.data,
          });
        }

        return response;
      },
      (error) => {
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

        return Promise.reject(error);
      }
    );
  }

  private getAuthToken(): string | null {
    // In a real application, this would get the token from auth context or storage
    // For now, return null as we're using MSW
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
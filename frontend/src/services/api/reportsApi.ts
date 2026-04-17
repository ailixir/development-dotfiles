import apiClient from './apiClient';
import { API_ENDPOINTS } from '@/utils/constants/appConfig';
import type { ReportEntity, ReportPreviewResponse, ReportSection, ReportSchedule, ReportExecution } from '@/types/reports/reportTypes';

export interface CreateReportPayload {
  name: string;
  description?: string;
  subject?: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  includeCharts: boolean;
  template: string;
  checks: string[];
  sections?: ReportSection[];
  schedule?: ReportSchedule;
}

export const reportsApi = {
  async getById(id: string): Promise<ReportEntity> {
    return await apiClient.get(API_ENDPOINTS.REPORT_BY_ID(id));
  },
  async createReport(payload: CreateReportPayload): Promise<ReportEntity> {
    return await apiClient.post(API_ENDPOINTS.REPORTS, payload);
  },

  async listReports(params?: { status?: string; page?: number; limit?: number }): Promise<{ data: ReportEntity[]; total: number; page: number; limit: number; totalPages: number; }> {
    return await apiClient.get(API_ENDPOINTS.REPORTS, { params });
  },

  async updateReport(id: string, payload: Partial<CreateReportPayload>): Promise<ReportEntity> {
    return await apiClient.put(API_ENDPOINTS.REPORT_BY_ID(id), payload);
  },

  async previewReport(id: string, params?: { __slow?: number; __fail?: number }): Promise<ReportPreviewResponse> {
    return await apiClient.post(API_ENDPOINTS.REPORT_PREVIEW(id), undefined, { params });
  },

  async getExecutions(id: string): Promise<{ data: any[]; total: number }> {
    return await apiClient.get(API_ENDPOINTS.REPORT_EXECUTIONS(id));
  },

  async pauseReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/pause`);
  },

  async resumeReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/resume`);
  },

  async duplicateReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/duplicate`);
  },

  async sendTest(id: string, to?: string): Promise<{ ok: boolean; sentAt: string }> {
    return await apiClient.post(`/reports/${id}/send-test`, to ? { to } : undefined);
  },

  async runNow(id: string): Promise<{ ok: boolean; execution: ReportExecution; report: ReportEntity }> {
    return await apiClient.post(`/reports/${id}/run-now`);
  },

  async deleteReport(id: string): Promise<{ ok: boolean }> {
    return await apiClient.delete(`/reports/${id}`);
  },
};

export default reportsApi;



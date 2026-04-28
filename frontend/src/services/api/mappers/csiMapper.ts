import type { CSI } from '../../../types/csi/csiTypes';

export interface BackendCsiDto {
  id: string;
  name: string;
  description: string | null;
  businessUnit: string;
  criticality: string;
  ownerEmail: string;
  environment: string;
  status: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export function mapCsiDtoToEntity(dto: BackendCsiDto): CSI {
  const metadata = dto.metadata ?? {};
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? '',
    businessUnit: dto.businessUnit,
    criticality: dto.criticality as CSI['criticality'],
    owner: dto.ownerEmail,
    environment: dto.environment as CSI['environment'],
    status: dto.status as CSI['status'],
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function isBackendCsiDto(raw: any): raw is BackendCsiDto {
  return raw && typeof raw.ownerEmail === 'string' && typeof raw.businessUnit === 'string';
}

export function mapCsiResponse(raw: any): CSI {
  if (isBackendCsiDto(raw)) {
    return mapCsiDtoToEntity(raw);
  }
  return raw;
}

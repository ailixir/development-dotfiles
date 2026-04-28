import type { User } from '../../../types/common/commonTypes';

export interface BackendUserDto {
  id: string;
  ssoId: string;
  name: string;
  email: string;
  department: string;
  createdAt: string;
  lastLogin: string | null;
  active: boolean;
}

export function mapUserDtoToUser(dto: BackendUserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.department,
    teams: [],
    permissions: [],
  };
}

export function isBackendUserDto(raw: any): raw is BackendUserDto {
  return raw && typeof raw.ssoId === 'string' && typeof raw.department === 'string';
}

export function mapUserResponse(raw: any): User {
  if (isBackendUserDto(raw)) {
    return mapUserDtoToUser(raw);
  }
  return raw as User;
}

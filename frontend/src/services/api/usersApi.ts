import apiClient from './apiClient';
import { mapUserResponse } from './mappers/userMapper';
import type { User } from '../../types/common/commonTypes';

export const usersApi = {
  async getMe(): Promise<User> {
    const raw = await apiClient.get('/users/me');
    return mapUserResponse(raw);
  },
};

export default usersApi;

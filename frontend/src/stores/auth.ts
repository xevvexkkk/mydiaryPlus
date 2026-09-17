import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../utils/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: number; username: string; isAdmin?: boolean } | null>(null);

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      user.value = res.data.user;
    } catch {
      user.value = null;
    }
  };

  const setAuth = (newUser: { id: number; username: string; isAdmin?: boolean }) => {
    user.value = newUser;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    user.value = null;
  };

  return { user, fetchUser, setAuth, logout };
});

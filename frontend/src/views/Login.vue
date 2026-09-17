<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import api from '../utils/api';
import { BookOpenText, Loader2 } from 'lucide-vue-next';

const authStore = useAuthStore();
const router = useRouter();

const isLoginMode = ref(true);
const username = ref('');
const password = ref('');
const errorMsg = ref('');
const loading = ref(false);

const handleSubmit = async () => {
  if (!username.value || !password.value) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const endpoint = isLoginMode.value ? '/auth/login' : '/auth/register';
    const res = await api.post(endpoint, { username: username.value, password: password.value });

    authStore.setAuth(res.data.user);
    router.push('/');
  } catch (err: any) {
    errorMsg.value = err.response?.data?.error || '请求失败，请重试';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center">
    <div class="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-10 relative overflow-hidden">
      <!-- Decorator Blob -->
      <div class="absolute -top-16 -right-16 w-32 h-32 bg-indigo-50 rounded-full blur-2xl opacity-70 border-none pointer-events-none"></div>
      
      <div class="text-center mb-8 relative z-10">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mb-5 shadow-sm">
          <BookOpenText class="w-7 h-7" />
        </div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-800">{{ isLoginMode ? '欢迎回到日记本' : '开启日记之旅' }}</h2>
        <p class="text-slate-500 mt-2 text-sm">{{ isLoginMode ? '记录每天的心情与点滴' : '立即创建一个专属于你的私密日记本' }}</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5 relative z-10">
        <div class="space-y-1">
          <label class="block text-sm font-medium text-slate-700">用户名</label>
          <input v-model="username" type="text" required
            class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
            placeholder="输入任意用户名" />
        </div>
        <div class="space-y-1">
          <label class="block text-sm font-medium text-slate-700">密码</label>
          <input v-model="password" type="password" required
            class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
            placeholder="输入密码" />
        </div>
        
        <p v-if="errorMsg" :class="isLoginMode && errorMsg.includes('成功') ? 'text-green-500' : 'text-red-500'" class="text-sm text-center min-h-[20px] font-medium">
          {{ errorMsg }}
        </p>

        <button type="submit" :disabled="loading"
          class="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-70 disabled:active:scale-100">
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? (isLoginMode ? '登录中...' : '注册中...') : (isLoginMode ? '登录' : '立即注册') }}
        </button>
      </form>

      <div class="mt-8 text-center text-sm text-slate-500 relative z-10">
        {{ isLoginMode ? '没有账号?' : '已有账号?' }}
        <button type="button" @click="isLoginMode = !isLoginMode; errorMsg = ''" class="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
          {{ isLoginMode ? '创建一个新账号' : '使用已有账号登录' }}
        </button>
      </div>
    </div>
  </div>
</template>

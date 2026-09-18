<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import api from '../utils/api';
import { BookHeart, Check, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-vue-next';

const authStore = useAuthStore();
const router = useRouter();
const isLoginMode = ref(true);
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMsg = ref('');
const loading = ref(false);

const switchMode = () => {
  isLoginMode.value = !isLoginMode.value;
  errorMsg.value = '';
};

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
    errorMsg.value = err.response?.data?.error || '请求失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-page">
    <section class="login-story">
      <div class="story-brand">
        <span><BookHeart class="h-5 w-5" /></span>
        <strong>MyDiary</strong>
      </div>
      <div class="story-copy">
        <p class="eyebrow">你的私人日记</p>
        <h1>让日子留下<br />温柔的回声。</h1>
        <p>一处安静、安全的空间，收藏每天的心情、照片与念头。</p>
        <ul>
          <li><Check class="h-4 w-4" /> 数据保存在自己的服务器</li>
          <li><Check class="h-4 w-4" /> 自动保存，不怕灵感丢失</li>
          <li><Check class="h-4 w-4" /> 日历与全文搜索随时回顾</li>
        </ul>
      </div>
      <blockquote>“记录不是为了留住时间，而是为了再次看见自己。”</blockquote>
    </section>

    <section class="login-panel">
      <div class="mobile-brand">
        <span><BookHeart class="h-5 w-5" /></span>
        <strong>MyDiary</strong>
      </div>

      <div class="login-form-wrap">
        <div class="form-heading">
          <span><LockKeyhole class="h-5 w-5" /></span>
          <p class="eyebrow">{{ isLoginMode ? '欢迎回来' : '创建账户' }}</p>
          <h2>{{ isLoginMode ? '继续书写你的故事' : '从今天开始记录' }}</h2>
          <p>{{ isLoginMode ? '登录后，回到只属于你的日记空间。' : '首位注册用户将成为管理员。' }}</p>
        </div>

        <form @submit.prevent="handleSubmit">
          <label>
            <span>用户名</span>
            <input v-model="username" type="text" required autocomplete="username" placeholder="输入用户名" />
          </label>
          <label>
            <span>密码</span>
            <div class="password-field">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                :autocomplete="isLoginMode ? 'current-password' : 'new-password'"
                placeholder="输入密码"
              />
              <button type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
                <EyeOff v-if="showPassword" class="h-4 w-4" />
                <Eye v-else class="h-4 w-4" />
              </button>
            </div>
          </label>

          <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>

          <button type="submit" class="login-submit" :disabled="loading">
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            {{ loading ? '请稍候…' : (isLoginMode ? '进入日记' : '创建并进入') }}
          </button>
        </form>

        <p class="mode-switch">
          {{ isLoginMode ? '第一次来到这里？' : '已经有账户？' }}
          <button type="button" @click="switchMode">{{ isLoginMode ? '创建账户' : '返回登录' }}</button>
        </p>
      </div>

      <p class="privacy-footer">私密部署 · 数据由你掌控</p>
    </section>
  </div>
</template>

<style scoped>
.login-page { display: grid; min-height: 100vh; grid-template-columns: minmax(360px, .9fr) minmax(480px, 1.1fr); background: radial-gradient(circle at 78% 14%, rgba(183,216,194,.62), transparent 26rem), radial-gradient(circle at 75% 85%, rgba(229,207,170,.42), transparent 30rem), linear-gradient(145deg, #eef4ee, #f7f3eb); }
.login-story { position: relative; display: flex; min-height: calc(100vh - 2rem); margin: 1rem 0 1rem 1rem; flex-direction: column; overflow: hidden; padding: 2.3rem clamp(2.2rem, 5vw, 5rem); border: 1px solid rgba(255,255,255,.22); border-radius: 32px; background: linear-gradient(145deg, rgba(37,69,50,.94), rgba(63,95,72,.85) 62%, rgba(84,113,91,.78)); color: white; box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 28px 70px rgba(35,59,43,.2); backdrop-filter: blur(26px) saturate(145%); }
.login-story::before, .login-story::after { content: ''; position: absolute; border: 1px solid rgba(255,255,255,.13); border-radius: 50%; }
.login-story::before { width: 500px; height: 500px; right: -280px; top: -160px; box-shadow: 0 0 0 70px rgba(255,255,255,.035), 0 0 0 140px rgba(255,255,255,.022); }
.login-story::after { width: 280px; height: 280px; left: -170px; bottom: -80px; }
.story-brand, .mobile-brand { position: relative; z-index: 1; display: flex; align-items: center; gap: .7rem; }
.story-brand span, .mobile-brand span { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 12px; background: rgba(255,255,255,.14); box-shadow: inset 0 1px 0 rgba(255,255,255,.22); backdrop-filter: blur(14px); }
.story-brand strong, .mobile-brand strong { font-size: .9rem; letter-spacing: -.01em; }
.story-copy { position: relative; z-index: 1; margin: auto 0; max-width: 510px; }
.story-copy .eyebrow { color: #c3d2c7; }
.story-copy h1 { margin-top: .8rem; font-family: Georgia, "Songti SC", serif; font-size: clamp(2.7rem, 5vw, 4.5rem); font-weight: 500; line-height: 1.12; letter-spacing: -.045em; }
.story-copy > p:not(.eyebrow) { margin-top: 1.4rem; max-width: 430px; color: rgba(255,255,255,.66); font-family: Georgia, "Songti SC", serif; font-size: 1rem; line-height: 1.8; }
.story-copy ul { display: flex; flex-direction: column; gap: .8rem; margin-top: 2.2rem; color: rgba(255,255,255,.76); font-size: .76rem; }
.story-copy li { display: flex; align-items: center; gap: .6rem; }
.story-copy li svg { color: #c4d9c9; }
.login-story blockquote { position: relative; z-index: 1; border-left: 1px solid rgba(255,255,255,.26); padding-left: 1rem; color: rgba(255,255,255,.48); font-family: Georgia, "Songti SC", serif; font-size: .7rem; }
.login-panel { display: flex; min-height: 100vh; flex-direction: column; padding: 2.3rem clamp(2rem, 6vw, 7rem); }
.mobile-brand { display: none; color: #3f5848; }
.mobile-brand span { background: rgba(255,255,255,.42); border-color: rgba(255,255,255,.7); }
.login-form-wrap { width: 100%; max-width: 460px; margin: auto; border: 1px solid rgba(255,255,255,.74); border-radius: 28px; padding: clamp(1.7rem, 4vw, 2.6rem); background: linear-gradient(145deg, rgba(255,255,255,.58), rgba(248,250,247,.28)); box-shadow: inset 0 1px 0 rgba(255,255,255,.92), 0 24px 70px rgba(45,62,51,.12); backdrop-filter: blur(28px) saturate(165%); }
.form-heading > span { display: grid; width: 42px; height: 42px; margin-bottom: 1.3rem; place-items: center; border: 1px solid rgba(255,255,255,.75); border-radius: 13px; background: rgba(255,255,255,.44); color: #4e6956; box-shadow: inset 0 1px 0 rgba(255,255,255,.92), 0 8px 20px rgba(48,70,54,.07); }
.form-heading h2 { margin-top: .45rem; font-family: Georgia, "Songti SC", serif; font-size: 2rem; font-weight: 600; letter-spacing: -.035em; color: #2d3931; }
.form-heading > p:last-child { margin-top: .65rem; color: #8b938e; font-size: .78rem; }
form { display: flex; flex-direction: column; gap: 1.15rem; margin-top: 2rem; }
label > span { display: block; margin-bottom: .45rem; color: #59645d; font-size: .7rem; font-weight: 700; }
input { width: 100%; border: 1px solid rgba(255,255,255,.74); border-radius: 13px; padding: .8rem .9rem; outline: none; background: rgba(255,255,255,.4); color: #303b34; font-size: .82rem; box-shadow: inset 0 1px 0 rgba(255,255,255,.86), 0 8px 22px rgba(48,65,53,.045); backdrop-filter: blur(12px); transition: .2s; }
input:focus { background: rgba(255,255,255,.62); box-shadow: inset 0 1px 0 rgba(255,255,255,.94), 0 10px 26px rgba(48,65,53,.07), 0 0 0 4px rgba(255,255,255,.25); }
.password-field { position: relative; }
.password-field input { padding-right: 3rem; }
.password-field button { position: absolute; right: .45rem; top: 50%; display: grid; width: 34px; height: 34px; transform: translateY(-50%); place-items: center; border-radius: 9px; color: #929a94; }
.password-field button:hover { background: rgba(255,255,255,.46); color: #536158; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.form-error { border-radius: 10px; padding: .65rem .8rem; background: #fff0ee; color: #a34d47; font-size: .7rem; }
.login-submit { display: flex; align-items: center; justify-content: center; gap: .5rem; margin-top: .35rem; border: 1px solid rgba(255,255,255,.28); border-radius: 13px; padding: .85rem; background: linear-gradient(145deg, rgba(54,85,65,.95), rgba(81,116,90,.86)); color: white; font-size: .78rem; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 12px 28px rgba(55,84,65,.22); transition: .2s; }
.login-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 16px 34px rgba(55,84,65,.28); }
.login-submit:disabled { opacity: .6; }
.mode-switch { margin-top: 1.5rem; color: #909893; text-align: center; font-size: .7rem; }
.mode-switch button { margin-left: .25rem; color: #45604e; font-weight: 700; }
.mode-switch button:hover { text-decoration: underline; }
.privacy-footer { color: #a0a6a2; text-align: center; font-size: .6rem; letter-spacing: .08em; }
@media (max-width: 800px) {
  .login-page { display: block; }
  .login-story { display: none; }
  .login-panel { padding: 1.5rem 1.2rem; }
  .mobile-brand { display: flex; }
  .login-form-wrap { margin-block: auto; border-radius: 24px; padding: 1.5rem; }
  .form-heading h2 { font-size: 1.75rem; }
}
</style>

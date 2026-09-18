<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from './stores/auth';
import { useRouter, useRoute } from 'vue-router';
import { format } from 'date-fns';
import {
  BookHeart,
  CalendarDays,
  Search,
  LogOut,
  X,
  Menu,
  Plus,
  ArrowLeft,
  Feather,
  ShieldCheck,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const isDrawerOpen = ref(false);

const isEditor = computed(() => route.path.startsWith('/editor'));

const navigateTo = (path: string) => {
  router.push(path);
  isDrawerOpen.value = false;
};

const handleLogout = async () => {
  await authStore.logout();
  isDrawerOpen.value = false;
  router.push('/login');
};

const handleAddToday = () => {
  router.push(`/editor/${format(new Date(), 'yyyy-MM-dd')}`);
};
</script>

<template>
  <div class="app-shell">
    <Transition name="fade-overlay">
      <button
        v-if="isDrawerOpen"
        class="fixed inset-0 z-[90] bg-[#252b27]/30 backdrop-blur-sm lg:hidden"
        aria-label="关闭菜单"
        @click="isDrawerOpen = false"
      ></button>
    </Transition>

    <aside
      v-if="authStore.user"
      :class="[
        'app-sidebar',
        isDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <div class="flex items-center justify-between">
        <button class="brand-mark" @click="navigateTo('/')">
          <span class="brand-icon"><BookHeart class="h-5 w-5" /></span>
          <span>
            <strong>MyDiary</strong>
            <small>只属于你的片刻</small>
          </span>
        </button>
        <button class="icon-button lg:hidden" aria-label="关闭菜单" @click="isDrawerOpen = false">
          <X class="h-5 w-5" />
        </button>
      </div>

      <button class="new-entry-button" @click="handleAddToday">
        <Plus class="h-5 w-5" />
        记录今天
      </button>

      <nav class="sidebar-nav" aria-label="主菜单">
        <p class="nav-caption">我的空间</p>
        <button :class="{ active: route.path === '/' }" @click="navigateTo('/')">
          <CalendarDays class="h-[18px] w-[18px]" />
          <span>日记</span>
        </button>
        <button :class="{ active: route.path === '/search' }" @click="navigateTo('/search')">
          <Search class="h-[18px] w-[18px]" />
          <span>搜索</span>
        </button>
      </nav>

      <div class="privacy-note">
        <ShieldCheck class="h-5 w-5" />
        <div>
          <strong>私密且由你掌控</strong>
          <p>记录仅保存在你的服务中</p>
        </div>
      </div>

      <div class="sidebar-user">
        <span class="user-avatar">{{ authStore.user.username.slice(0, 1).toUpperCase() }}</span>
        <div class="min-w-0 flex-1">
          <strong class="block truncate">{{ authStore.user.username }}</strong>
          <span>{{ authStore.user.isAdmin ? '管理员' : '日记主人' }}</span>
        </div>
        <button class="icon-button" title="退出登录" aria-label="退出登录" @click="handleLogout">
          <LogOut class="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>

    <div :class="['app-content', authStore.user && 'lg:pl-[272px]']">
      <header v-if="authStore.user" class="mobile-header lg:hidden">
        <button v-if="isEditor" class="icon-button" aria-label="返回" @click="router.back()">
          <ArrowLeft class="h-5 w-5" />
        </button>
        <button v-else class="icon-button" aria-label="打开菜单" @click="isDrawerOpen = true">
          <Menu class="h-5 w-5" />
        </button>

        <div id="app-header-center" class="min-w-0 flex-1 text-center">
          <span v-if="!isEditor" class="flex items-center justify-center gap-2 font-semibold">
            <Feather class="h-4 w-4 text-primary" /> MyDiary
          </span>
        </div>

        <button class="icon-button" aria-label="搜索" @click="navigateTo('/search')">
          <Search class="h-5 w-5" />
        </button>
      </header>

      <main :class="['page-container', authStore.user ? 'authenticated' : 'guest', isEditor && 'editor-page']">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <nav v-if="authStore.user && !isEditor" class="mobile-tabbar lg:hidden" aria-label="移动端导航">
      <button :class="{ active: route.path === '/' }" @click="navigateTo('/')">
        <CalendarDays class="h-5 w-5" /><span>日记</span>
      </button>
      <button class="mobile-compose" aria-label="记录今天" @click="handleAddToday">
        <Plus class="h-6 w-6" />
      </button>
      <button :class="{ active: route.path === '/search' }" @click="navigateTo('/search')">
        <Search class="h-5 w-5" /><span>搜索</span>
      </button>
    </nav>
  </div>
</template>

<style>
.page-fade-enter-active,
.page-fade-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.page-fade-enter-from,
.page-fade-leave-to { opacity: 0; transform: translateY(5px); }
.fade-overlay-enter-active,
.fade-overlay-leave-active { transition: opacity 200ms ease; }
.fade-overlay-enter-from,
.fade-overlay-leave-to { opacity: 0; }
</style>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from './stores/auth';
import { useRouter, useRoute } from 'vue-router';
import { format } from 'date-fns';
import { LayoutDashboard, Search, LogOut, X, Menu, Plus, ArrowLeft } from 'lucide-vue-next';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const isDrawerOpen = ref(false);

const handleLogout = async () => {
  await authStore.logout();
  isDrawerOpen.value = false;
  router.push('/login');
};

const handleAddToday = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  router.push(`/editor/${today}`);
};

const goHome = () => {
  router.push('/');
  isDrawerOpen.value = false;
};

const goSearch = () => {
  router.push('/search');
  isDrawerOpen.value = false;
};

const toggleDrawer = () => {
  isDrawerOpen.value = !isDrawerOpen.value;
};
</script>

<template>
  <div class="min-h-screen bg-[#fafaf5] dark:bg-[#2e342d] overflow-x-hidden">
    <!-- Drawer Overlay -->
    <Transition name="fade-overlay">
      <div v-if="isDrawerOpen" 
        class="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
        @click="isDrawerOpen = false"></div>
    </Transition>

    <!-- Side Drawer -->
    <Transition name="slide">
      <aside v-if="isDrawerOpen" 
        class="fixed inset-y-0 left-0 w-64 bg-white dark:bg-[#1a1c1e] z-[101] shadow-2xl p-6 flex flex-col gap-8">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-headline font-bold text-lg text-[#4c6455] dark:text-[#cee9d6] uppercase tracking-widest opacity-40">菜单选项</h2>
          <button @click="isDrawerOpen = false" class="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors">
            <X class="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>

        <nav class="flex flex-col gap-2">
          <button @click="goHome" 
            :class="['flex items-center gap-4 p-4 rounded-2xl transition-all font-bold', 
                    route.path === '/' ? 'bg-[#4c6455]/10 text-[#4c6455]' : 'hover:bg-slate-50 text-on-surface-variant']">
            <LayoutDashboard class="w-5 h-5" />
            <span>日记首页</span>
          </button>
          
          <button @click="goSearch" 
            :class="['flex items-center gap-4 p-4 rounded-2xl transition-all font-bold', 
                    route.path === '/search' ? 'bg-[#4c6455]/10 text-[#4c6455]' : 'hover:bg-slate-50 text-on-surface-variant']">
            <Search class="w-5 h-5" />
            <span>搜索回忆</span>
          </button>

          <div class="h-px bg-outline/10 my-4"></div>

          <button @click="handleLogout" 
            class="flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-red-500 hover:bg-red-50">
            <LogOut class="w-5 h-5" />
            <span>退出登录</span>
          </button>
        </nav>

        <div class="mt-auto py-4 text-center border-t border-slate-50 dark:border-white/5">
          <p class="text-[10px] text-on-surface-variant/30 uppercase tracking-[0.2em]">The Digital Sanctuary</p>
        </div>
      </aside>
    </Transition>

    <!-- TopAppBar -->
    <header v-if="authStore.user"
        class="fixed top-0 w-full z-50 bg-[#fafaf5]/80 dark:bg-[#2e342d]/80 backdrop-blur-xl shadow-[0_24px_48px_rgba(46,52,45,0.06)] h-16 flex items-center justify-between px-6">
        <div class="flex items-center gap-4">
            <!-- Show Back button instead of Menu when in Editor -->
            <button v-if="route.path.startsWith('/editor')" @click="router.back()" class="text-[#4c6455] active:scale-95 duration-200 hover:bg-[#f3f4ee] p-2 rounded-full">
              <ArrowLeft class="w-6 h-6" />
            </button>
            <button v-else @click="toggleDrawer" class="text-[#4c6455] active:scale-95 duration-200 hover:bg-[#f3f4ee] p-2 rounded-full">
              <Menu class="w-6 h-6" />
            </button>
        </div>
        
        <!-- Portal for child components to inject header content -->
        <div id="app-header-center" class="flex-1 flex justify-center overflow-hidden"></div>

        <button v-if="route.path !== '/search'" class="text-[#4c6455] active:scale-95 duration-200 hover:bg-[#f3f4ee] p-2 rounded-full" @click="goSearch">
          <Search class="w-6 h-6" />
        </button>
    </header>

    <main :class="['w-full max-w-2xl mx-auto min-h-screen', authStore.user ? 'pt-24 pb-32 px-6' : 'p-6']">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <template v-if="authStore.user && !route.path.startsWith('/editor')">
      <!-- FAB -->
      <button @click="handleAddToday"
          class="fixed bottom-10 right-6 w-14 h-14 bg-gradient-to-br from-[#4c6455] to-[#6b8574] text-white rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-transform z-40">
          <Plus class="w-8 h-8" />
      </button>
    </template>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.fade-overlay-enter-active, .fade-overlay-leave-active {
  transition: opacity 0.3s ease;
}
.fade-overlay-enter-from, .fade-overlay-leave-to {
  opacity: 0;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.3s cubic-bezier(0, 0, 0.2, 1);
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(-100%);
}
</style>

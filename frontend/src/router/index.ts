import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue') },
    { 
      path: '/', 
      component: () => import('../views/Calendar.vue'),
      meta: { requiresAuth: true }
    },
    { 
      path: '/editor/:date', 
      component: () => import('../views/Editor.vue'),
      meta: { requiresAuth: true }
    },
    { 
      path: '/search', 
      component: () => import('../views/Search.vue'),
      meta: { requiresAuth: true }
    }
  ],
  scrollBehavior(_to, _from, _savedPosition) {
    return { top: 0 };
  },
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Skip session check on login page to avoid redirect loop
  if (to.path === '/login') {
    if (authStore.user) {
      next('/');
      return;
    }
    next();
    return;
  }

  // For protected routes, try to fetch user if not already known
  if (to.meta.requiresAuth && !authStore.user) {
    try {
      await authStore.fetchUser();
    } catch {
      // fetchUser failed silently; user remains null
    }
    if (!authStore.user) {
      next('/login');
      return;
    }
  }

  next();
});

export default router;

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import api from '../utils/api';
import { Plus, X, Loader2, CloudCheck, CloudUpload, CloudOff, AlertCircle } from 'lucide-vue-next';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const route = useRoute();
const dateStr = route.params.date as string;

const content = ref('');
const emoji = ref('📝');
const uploadedImages = ref<string[]>([]);
const selectedImageUrl = ref<string | null>(null);
const loading = ref(false);

// 同步状态：'synced' | 'syncing' | 'cached' | 'error'
const syncStatus = ref<'synced' | 'syncing' | 'cached' | 'error'>('synced');
const isOnline = ref(navigator.onLine);
const showRestoreModal = ref(false);
const localDraft = ref<{ content: string; emoji: string; images: string[] } | null>(null);

const emojis = ['😃', '😊', '🥰', '😌', '😎', '🤔', '😐', '😔', '😢', '😡', '📝', '🏃', '☕', '🌟'];
const moodMap: Record<string, string> = {
  '😃': '开心', '😊': '微笑', '🥰': '喜爱', '😌': '平静',
  '😎': '酷', '🤔': '思考', '😐': '平淡', '😔': '忧郁',
  '😢': '难过', '😡': '生气', '📝': '记录', '🏃': '运动',
  '☕': '休息', '🌟': '闪耀'
};

const cacheKey = computed(() => `diary_draft_${dateStr}`);

// 获取本地缓存
const getLocalDraft = () => {
  const saved = localStorage.getItem(cacheKey.value);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// 保存本地缓存
const saveLocalDraft = () => {
  const data = {
    content: content.value,
    emoji: emoji.value,
    images: uploadedImages.value,
    timestamp: Date.now()
  };
  localStorage.setItem(cacheKey.value, JSON.stringify(data));
};

// 合并新字段图片和旧正文中的 Markdown 图片，确保兼容性
const imagesInContent = computed(() => {
  const legacyRegex = /!\[.*?\]\((.*?)\)/g;
  const legacyImages = [];
  let match;
  while ((match = legacyRegex.exec(content.value)) !== null) {
    legacyImages.push(match[1]);
  }
  // 去重合并
  return Array.from(new Set([...uploadedImages.value, ...legacyImages]));
});

const fetchDiary = async () => {
  loading.value = true;
  try {
    const res = await api.get(`/diaries/${dateStr}`);
    const serverData = res.data;
    
    // 初始化数据
    content.value = serverData.content || '';
    emoji.value = serverData.mood_emoji || '📝';
    uploadedImages.value = serverData.images || [];

    // 检查本地是否有更长的草稿
    const draft = getLocalDraft();
    if (draft && draft.content !== content.value && draft.content.length > 3) {
      localDraft.value = draft;
      showRestoreModal.value = true;
    }
  } catch (err: any) {
    if (err.response?.status === 404) {
      // 如果是新日记，也查一下本地草稿
      const draft = getLocalDraft();
      if (draft && draft.content.length > 0) {
        localDraft.value = draft;
        showRestoreModal.value = true;
      }
    } else {
      console.error('Failed to load diary', err);
    }
  } finally {
    loading.value = false;
  }
};

const restoreDraft = () => {
  if (localDraft.value) {
    content.value = localDraft.value.content;
    emoji.value = localDraft.value.emoji;
    uploadedImages.value = localDraft.value.images;
  }
  showRestoreModal.value = false;
};

// 云端同步逻辑
let autosaveTimer: any = null;
const triggerAutosave = () => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  
  syncStatus.value = 'syncing';
  saveLocalDraft();

  autosaveTimer = setTimeout(async () => {
    if (!navigator.onLine) {
      syncStatus.value = 'cached';
      return;
    }

    try {
      await api.post('/diaries', { 
        date: dateStr, 
        content: content.value, 
        mood_emoji: emoji.value,
        images: uploadedImages.value 
      });
      syncStatus.value = 'synced';
      // 同步成功后可以清除旧缓存，或者保持直到页面关闭
    } catch (err) {
      console.error('Autosave failed:', err);
      syncStatus.value = 'error';
    }
  }, 2000);
};

// 监听变动触发自动保存
watch([content, emoji, uploadedImages], () => {
  if (loading.value) return; // 加载时不触发
  triggerAutosave();
}, { deep: true });

const handleImageUpload = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const url = res.data.url;
    uploadedImages.value.push(url);
  } catch (err) {
    console.error('Image upload failed', err);
    syncStatus.value = 'error';
  }
  (e.target as HTMLInputElement).value = '';
};

const removeImage = async (url: string) => {
  uploadedImages.value = uploadedImages.value.filter(img => img !== url);
  const regex = new RegExp(`\\n?!\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\n?`, 'g');
  content.value = content.value.replace(regex, '');

  // Call backend to soft-delete the attachment
  const match = url.match(/\/api\/attachments\/([a-f0-9-]+)/);
  if (match) {
    try {
      await api.delete(`/attachments/${match[1]}`);
    } catch (err) {
      console.error('Failed to delete attachment on server:', err);
    }
  }
};

const displayDate = computed(() => {
  try {
    const d = new Date(dateStr);
    return format(d, 'yyyy年MM月dd日', { locale: zhCN });
  } catch (e) {
    return dateStr;
  }
});

const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine;
  if (isOnline.value && syncStatus.value === 'cached') {
    triggerAutosave();
  }
};

onMounted(() => {
  fetchDiary();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});
</script>

<template>
  <div class="min-h-screen bg-[#fafaf5] font-label pb-20 overflow-x-hidden">
    <!-- Header Portal Content -->
    <Teleport to="#app-header-center">
      <div class="flex flex-col items-center">
        <div class="flex items-center gap-1.5 leading-none">
          <span class="font-label text-xs font-bold text-[#4c6455]">{{ displayDate }}</span>
          <span class="w-1 h-1 rounded-full bg-[#4c6455]/20"></span>
          <!-- Sync Status Indicator -->
          <div class="flex items-center gap-1">
            <template v-if="syncStatus === 'synced'">
              <CloudCheck class="w-3.5 h-3.5 text-sage" />
            </template>
            <template v-else-if="syncStatus === 'syncing'">
              <Loader2 class="w-3.5 h-3.5 text-sage animate-spin" />
            </template>
            <template v-else-if="syncStatus === 'cached'">
              <CloudOff class="w-3.5 h-3.5 text-on-surface-variant/40" />
            </template>
            <template v-else-if="syncStatus === 'error'">
              <AlertCircle class="w-3.5 h-3.5 text-red-400" />
            </template>
          </div>
        </div>
        <span class="font-label text-[9px] font-bold tracking-[0.2em] text-[#4c6455]/40 uppercase mt-0.5">数据已同步</span>
      </div>
    </Teleport>

    <div v-if="loading" class="flex justify-center items-center py-20">
      <Loader2 class="w-8 h-8 text-sage animate-spin" />
    </div>

    <main v-else class="max-w-xl mx-auto px-6 pt-0 space-y-8 pb-32">
      <!-- Restore Draft Modal (Floating Tip) -->
      <Transition name="fade">
        <div v-if="showRestoreModal" class="fixed top-24 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-3rem)] max-w-md bg-white border border-sage/20 rounded-2xl shadow-xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-sage/10 rounded-full text-sage">
              <CloudUpload class="w-5 h-5" />
            </div>
            <div>
              <p class="text-sm font-bold text-on-surface">发现未同步草稿</p>
              <p class="text-[11px] text-on-surface-variant/60">上次编辑的内容似乎还留在本地</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="showRestoreModal = false" class="px-3 py-1.5 text-[11px] font-bold text-on-surface-variant/40 hover:text-on-surface transition-colors">忽略</button>
            <button @click="restoreDraft" class="px-4 py-1.5 bg-sage text-white rounded-full text-[11px] font-bold shadow-sm shadow-sage/20 hover:bg-sage-light transition-all">恢复</button>
          </div>
        </div>
      </Transition>
      <!-- Mood Selector -->
      <section class="flex items-center justify-between py-2 border-y border-outline/20 group relative">
        <div class="relative">
          <select v-model="emoji" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10 appearance-none">
            <option v-for="e in emojis" :key="e" :value="e">{{ e }} {{ moodMap[e] }}</option>
          </select>
          <button class="flex items-center gap-2 px-4 py-1.5 rounded-full bg-sage/10 text-sage hover:bg-sage/20 transition-all">
            <span class="text-lg">{{ emoji }}</span>
            <span class="text-[11px] font-bold tracking-wider uppercase">{{ moodMap[emoji] }}</span>
          </button>
        </div>
      </section>

      <!-- Writing Area Only -->
      <div class="space-y-6">
        <!-- Editor Box -->
        <article class="relative group">
          <textarea 
            v-model="content" 
            class="w-full min-h-[400px] bg-transparent border-none p-0 font-body text-[1.35rem] leading-[1.8] text-on-surface outline-none focus:ring-0 resize-none transition-all placeholder:italic placeholder:text-on-surface-variant/20"
            placeholder="今天感觉如何？让思绪自然流淌..."
          ></textarea>
        </article>
      </div>

      <!-- Visual Memory Gallery -->
      <section class="space-y-4 pt-4">
        <h3 class="font-label text-[10px] font-bold tracking-[0.15em] text-on-surface-variant/40 uppercase">视觉回忆</h3>
        <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
          <!-- Upload Button -->
          <label class="flex-shrink-0 w-24 h-24 rounded-2xl border-2 border-dashed border-outline/50 hover:border-sage/40 hover:bg-sage/5 transition-all flex flex-col items-center justify-center text-on-surface-variant/40 hover:text-sage group cursor-pointer">
            <Plus class="w-6 h-6 group-hover:scale-110 transition-transform" />
            <input type="file" class="hidden" accept="image/*" @change="handleImageUpload" />
          </label>
          
          <!-- Thumbnails -->
          <div v-for="imgUrl in imagesInContent" :key="imgUrl" 
            @click="selectedImageUrl = imgUrl"
            class="flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden relative group shadow-sm border border-outline/10 cursor-zoom-in active:scale-95 transition-transform">
            <img :src="imgUrl" alt="Memory" class="w-full h-full object-cover" />
            <button @click.stop="removeImage(imgUrl)" class="absolute top-1.5 right-1.5 bg-black/40 backdrop-blur-md text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>
    </main>

    <!-- Simple Navigation (Hidden on Editor) -->

    <!-- Image Lightbox -->
    <Transition name="scale">
      <div v-if="selectedImageUrl" 
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10 bg-neutral-soft/60 backdrop-blur-xl"
        @click="selectedImageUrl = null">
        
        <div class="relative max-w-5xl w-full h-full flex items-center justify-center pointer-events-none">
          <img :src="selectedImageUrl" 
            class="max-w-full max-h-full object-contain rounded-3xl shadow-2xl pointer-events-auto" 
            @click.stop />
          
          <button @click="selectedImageUrl = null" 
            class="absolute top-0 right-0 sm:-top-12 sm:-right-12 p-3 bg-white/50 hover:bg-white border border-outline/20 rounded-full text-on-surface transition-all pointer-events-auto shadow-lg backdrop-blur-md">
            <X class="w-6 h-6" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.font-body {
  font-family: 'Newsreader', serif;
}
.font-label {
  font-family: 'Manrope', sans-serif;
}
.font-headline {
  font-family: 'Manrope', sans-serif;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Base prose cleanup if tailwind-typography not acting fully */
:deep(.prose) {
  color: #2D332F;
}
:deep(.prose p) {
  margin-top: 1.5em;
  margin-bottom: 1.5em;
  line-height: 1.8;
}
:deep(.prose img) {
  max-width: 100%;
  height: auto;
  margin: 2rem 0;
}

/* Lightbox Transitions */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
  transform: scale(1.1);
}
</style>

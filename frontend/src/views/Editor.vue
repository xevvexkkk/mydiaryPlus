<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../utils/api';
import { Plus, X, Loader2, CloudCheck, CloudUpload, CloudOff, AlertCircle, ChevronDown, Image as ImageIcon } from 'lucide-vue-next';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import PhotoViewer from '../components/PhotoViewer.vue';

const route = useRoute();
const router = useRouter();
const dateStr = route.params.date as string;

const content = ref('');
const emoji = ref('📝');
const uploadedImages = ref<string[]>([]);
const selectedImageIndex = ref<number | null>(null);
const loading = ref(false);
const showMoodPicker = ref(false);
const uploadError = ref('');
const syncError = ref('');

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
  syncError.value = '';
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
    } catch (err: any) {
      console.error('Autosave failed:', err);
      syncError.value = err.response?.data?.error || err.message || '请求未能发出';
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
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  uploadError.value = '';
  const uploadedUrls: string[] = [];
  let failedCount = 0;

  for (const file of files) {
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.post('/upload/image', formData);
      uploadedUrls.push(res.data.url);
    } catch (err: any) {
      console.error(`Image upload failed: ${file.name}`, err);
      const reason = err.response?.data?.error || err.message;
      if (reason) uploadError.value = reason;
      failedCount += 1;
    }
  }

  if (uploadedUrls.length) {
    uploadedImages.value.push(...uploadedUrls);
  }
  if (failedCount) {
    uploadError.value = `${failedCount} 张照片上传失败：${uploadError.value || '请重新选择后再试'}`;
  }

  input.value = '';
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

const displayWeekday = computed(() => {
  try {
    return format(new Date(dateStr), 'EEEE', { locale: zhCN });
  } catch {
    return '';
  }
});

const wordCount = computed(() => content.value.trim() ? content.value.trim().length : 0);
const syncLabel = computed(() => ({
  synced: '已保存',
  syncing: '保存中',
  cached: '离线草稿',
  error: '保存失败',
})[syncStatus.value]);

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
  <div class="editor-shell">
    <Teleport to="#app-header-center">
      <div class="mobile-editor-status">
        <strong>{{ displayDate }}</strong>
        <span>{{ syncLabel }}</span>
      </div>
    </Teleport>

    <div v-if="loading" class="editor-loading"><Loader2 class="h-7 w-7 animate-spin" /></div>

    <template v-else>
      <header class="editor-heading">
        <div class="editor-title-group">
          <button aria-label="返回" @click="router.back()">←</button>
          <div>
            <p class="eyebrow">{{ displayWeekday }}</p>
            <h1>{{ displayDate }}</h1>
          </div>
        </div>
        <div :class="['sync-state', syncStatus]" :title="syncError">
          <CloudCheck v-if="syncStatus === 'synced'" class="h-4 w-4" />
          <Loader2 v-else-if="syncStatus === 'syncing'" class="h-4 w-4 animate-spin" />
          <CloudOff v-else-if="syncStatus === 'cached'" class="h-4 w-4" />
          <AlertCircle v-else class="h-4 w-4" />
          {{ syncLabel }}
        </div>
      </header>

      <div v-if="syncStatus === 'error' && syncError" class="save-error-notice">
        <AlertCircle class="h-4 w-4" />
        <span>保存失败：{{ syncError }}</span>
        <button type="button" @click="triggerAutosave">重试</button>
      </div>

      <Transition name="draft">
        <div v-if="showRestoreModal" class="draft-notice">
          <span><CloudUpload class="h-5 w-5" /></span>
          <div>
            <strong>发现一份本地草稿</strong>
            <p>它可能包含尚未同步的内容。</p>
          </div>
          <button @click="showRestoreModal = false">忽略</button>
          <button class="restore" @click="restoreDraft">恢复草稿</button>
        </div>
      </Transition>

      <main class="writing-paper surface-card">
        <div class="writing-toolbar">
          <div class="mood-control">
            <button class="mood-trigger" @click="showMoodPicker = !showMoodPicker">
              <span>{{ emoji }}</span>
              <div><small>此刻心情</small><strong>{{ moodMap[emoji] }}</strong></div>
              <ChevronDown class="h-4 w-4" />
            </button>
            <Transition name="mood-pop">
              <div v-if="showMoodPicker" class="mood-picker">
                <p>选择今天的心情</p>
                <button
                  v-for="item in emojis"
                  :key="item"
                  :class="{ selected: emoji === item }"
                  :title="moodMap[item]"
                  @click="emoji = item; showMoodPicker = false"
                >
                  <span>{{ item }}</span><small>{{ moodMap[item] }}</small>
                </button>
              </div>
            </Transition>
          </div>
          <span class="word-count">{{ wordCount }} 字</span>
        </div>

        <textarea
          v-model="content"
          class="diary-textarea"
          placeholder="今天发生了什么？&#10;&#10;从一个瞬间、一句话，或一种感受开始……"
        ></textarea>

        <section class="memory-gallery">
          <div class="gallery-heading">
            <div><ImageIcon class="h-4 w-4" /><span>照片记忆</span></div>
            <small>{{ imagesInContent.length ? `${imagesInContent.length} 张` : '添加今天的画面' }}</small>
          </div>
          <p v-if="uploadError" class="upload-error">
            <AlertCircle class="h-3.5 w-3.5" />{{ uploadError }}
          </p>
          <div class="gallery-strip hide-scrollbar">
            <label class="upload-tile">
              <span><Plus class="h-5 w-5" /></span>
              <small>添加照片</small>
              <input
                type="file"
                class="upload-input"
                accept="image/*"
                multiple
                aria-label="从相册或相机添加照片"
                @change="handleImageUpload"
              />
            </label>
            <div
              v-for="(imgUrl, index) in imagesInContent"
              :key="imgUrl"
              class="image-tile"
              @click="selectedImageIndex = index"
            >
              <img :src="imgUrl" alt="日记照片" />
              <button aria-label="删除照片" @click.stop="removeImage(imgUrl)"><X class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>
      </main>
    </template>

    <PhotoViewer
      v-if="selectedImageIndex !== null"
      :images="imagesInContent"
      :initial-index="selectedImageIndex"
      @close="selectedImageIndex = null"
    />
  </div>
</template>

<style scoped>
.editor-shell { max-width: 780px; margin: 0 auto; }
.mobile-editor-status strong { display: block; overflow: hidden; text-overflow: ellipsis; color: #405147; font-size: .72rem; white-space: nowrap; }
.mobile-editor-status span { display: block; margin-top: .1rem; color: #959d97; font-size: .55rem; }
.editor-loading { display: grid; min-height: 55vh; place-items: center; color: #607566; }
.editor-heading { display: flex; align-items: end; justify-content: space-between; margin-bottom: 1.5rem; }
.editor-title-group { display: flex; align-items: center; gap: .8rem; }
.editor-title-group > button { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; color: #748078; font-size: 1rem; transition: .2s; }
.editor-title-group > button:hover { background: #e9ede7; color: #405147; }
.editor-heading h1 { margin-top: .35rem; font-family: Georgia, "Songti SC", serif; font-size: 2rem; font-weight: 600; letter-spacing: -.035em; color: #2d3931; }
.sync-state { display: flex; align-items: center; gap: .4rem; border: 1px solid rgba(255,255,255,.72); border-radius: 999px; padding: .45rem .7rem; background: rgba(255,255,255,.4); color: #728078; font-size: .62rem; font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,.88), 0 9px 24px rgba(48,66,53,.07); backdrop-filter: blur(16px) saturate(150%); }
.sync-state.error { border-color: #f0ccc7; color: #ad554e; }
.sync-state.cached { color: #8a8171; }
.save-error-notice { display: flex; align-items: center; gap: .5rem; margin-bottom: 1rem; border: 1px solid #f0ccc7; border-radius: 13px; padding: .65rem .8rem; background: rgba(255,240,238,.78); color: #a34d47; font-size: .65rem; }
.save-error-notice span { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.save-error-notice button { flex: 0 0 auto; border-radius: 8px; padding: .35rem .55rem; background: rgba(255,255,255,.65); font-weight: 700; }
.draft-notice { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: .75rem; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,.72); border-radius: 18px; padding: .8rem; background: linear-gradient(145deg, rgba(242,249,242,.62), rgba(255,255,255,.32)); box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 14px 36px rgba(48,61,52,.09); backdrop-filter: blur(22px) saturate(155%); }
.draft-notice > span { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid rgba(255,255,255,.72); border-radius: 11px; background: rgba(255,255,255,.48); color: #58705f; box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
.draft-notice strong { display: block; color: #405047; font-size: .72rem; }
.draft-notice p { margin-top: .15rem; color: #89938c; font-size: .6rem; }
.draft-notice button { padding: .5rem .65rem; color: #7c8880; font-size: .62rem; font-weight: 700; }
.draft-notice button.restore { border-radius: 9px; background: #486451; color: white; }
.writing-paper { overflow: visible; min-height: 650px; padding: 1.4rem clamp(1.25rem, 5vw, 3.5rem) 1.7rem; background: rgba(255,254,249,.93); border-color: rgba(255,255,255,.86); box-shadow: inset 0 1px 0 white, 0 22px 60px rgba(48,61,52,.1); -webkit-backdrop-filter: none; backdrop-filter: none; }
.writing-toolbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eceee9; padding-bottom: 1rem; }
.mood-control { position: relative; }
.mood-trigger { display: flex; align-items: center; gap: .7rem; border-radius: 12px; padding: .4rem .5rem; text-align: left; transition: .2s; }
.mood-trigger:hover { background: rgba(231,239,231,.62); box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.mood-trigger > span { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid rgba(255,255,255,.75); border-radius: 11px; background: linear-gradient(145deg, rgba(240,246,239,.78), rgba(255,255,255,.55)); box-shadow: inset 0 1px 0 rgba(255,255,255,.94), 0 7px 16px rgba(50,70,55,.06); font-size: 1.15rem; }
.mood-trigger div { min-width: 65px; }
.mood-trigger small { display: block; color: #9aa19c; font-size: .52rem; }
.mood-trigger strong { display: block; margin-top: .1rem; color: #536158; font-size: .68rem; }
.mood-trigger > svg { color: #a0a7a2; }
.word-count { color: #a1a7a2; font-size: .6rem; }
.mood-picker { position: absolute; top: calc(100% + .6rem); left: 0; z-index: 20; display: grid; width: 300px; grid-template-columns: repeat(4, 1fr); gap: .35rem; border: 1px solid rgba(255,255,255,.8); border-radius: 19px; padding: .8rem; background: linear-gradient(145deg, rgba(255,255,255,.72), rgba(244,249,244,.52)); box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 22px 55px rgba(44,58,48,.18); backdrop-filter: blur(26px) saturate(165%); }
.mood-picker p { grid-column: 1 / -1; margin-bottom: .3rem; color: #859087; font-size: .6rem; font-weight: 700; }
.mood-picker button { display: flex; flex-direction: column; align-items: center; gap: .2rem; border-radius: 10px; padding: .45rem .2rem; transition: .15s; }
.mood-picker button:hover, .mood-picker button.selected { background: rgba(255,255,255,.52); box-shadow: inset 0 1px 0 rgba(255,255,255,.85); }
.mood-picker button span { font-size: 1.05rem; }
.mood-picker button small { color: #7e8981; font-size: .52rem; }
.diary-textarea { display: block; width: 100%; min-height: 410px; resize: none; border: 0; outline: 0; padding: 2rem 0; background: transparent; color: #374139; font-family: Georgia, "Songti SC", "STSong", serif; font-size: 1.08rem; line-height: 2; }
.diary-textarea::placeholder { color: #b3b8b3; font-style: italic; }
.memory-gallery { border-top: 1px solid #eceee9; padding-top: 1rem; }
.gallery-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: .8rem; }
.gallery-heading > div { display: flex; align-items: center; gap: .45rem; color: #65726a; font-size: .65rem; font-weight: 700; }
.gallery-heading small { color: #a0a7a2; font-size: .55rem; }
.upload-error { display: flex; align-items: center; gap: .35rem; margin: -.25rem 0 .75rem; color: #ad554e; font-size: .6rem; }
.gallery-strip { display: flex; gap: .65rem; overflow-x: auto; padding-bottom: .2rem; }
.upload-tile, .image-tile { flex: 0 0 92px; width: 92px; height: 92px; border-radius: 14px; }
.upload-tile { position: relative; display: flex; cursor: pointer; flex-direction: column; align-items: center; justify-content: center; gap: .45rem; overflow: hidden; border: 1px dashed #cbd3cc; color: #859188; transition: .2s; }
.upload-tile:hover { border-color: #91a395; background: rgba(233,240,233,.55); color: #506858; }
.upload-tile span { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid rgba(255,255,255,.72); border-radius: 9px; background: rgba(255,255,255,.5); box-shadow: inset 0 1px 0 rgba(255,255,255,.88); }
.upload-tile small { font-size: .55rem; font-weight: 600; }
.upload-input { position: absolute; inset: 0; z-index: 2; display: block; width: 100%; height: 100%; cursor: pointer; opacity: 0; -webkit-appearance: none; appearance: none; }
.image-tile { position: relative; cursor: zoom-in; overflow: hidden; background: #eef0eb; }
.image-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s; }
.image-tile:hover img { transform: scale(1.04); }
.image-tile button { position: absolute; top: .35rem; right: .35rem; display: grid; width: 25px; height: 25px; place-items: center; border-radius: 8px; background: rgba(26,32,28,.55); color: white; opacity: 0; backdrop-filter: blur(5px); transition: .2s; }
.image-tile:hover button, .image-tile button:focus { opacity: 1; }
.mood-pop-enter-active, .mood-pop-leave-active, .draft-enter-active, .draft-leave-active { transition: all .2s ease; }
.mood-pop-enter-from, .mood-pop-leave-to { opacity: 0; transform: translateY(-5px) scale(.98); }
.draft-enter-from, .draft-leave-to { opacity: 0; transform: translateY(-5px); }
@media (max-width: 640px) {
  .editor-heading { display: none; }
  .writing-paper { min-height: calc(100vh - 7rem); margin: -.5rem; border-radius: 20px; padding-inline: 1.25rem; }
  .diary-textarea { min-height: 52vh; font-size: 1rem; }
  .mood-picker { width: min(300px, calc(100vw - 3rem)); }
  .draft-notice { grid-template-columns: auto 1fr auto; }
  .draft-notice > button:not(.restore) { display: none; }
  .image-tile button { opacity: 1; }
}
</style>

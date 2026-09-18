<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import MarkdownIt from 'markdown-it';
import { ArrowLeft, CalendarDays, Image as ImageIcon, Loader2, Pencil, X } from 'lucide-vue-next';
import api from '../utils/api';

interface DiaryEntry {
  id: number;
  date: string;
  content: string;
  mood_emoji: string;
  images: string[];
  updated_at: string;
}

const route = useRoute();
const router = useRouter();
const date = route.params.date as string;
const diary = ref<DiaryEntry | null>(null);
const loading = ref(true);
const notFound = ref(false);
const selectedImage = ref<string | null>(null);

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true });
const renderedContent = computed(() => markdown.render(diary.value?.content || ''));
const displayDate = computed(() => format(parseISO(date), 'yyyy年M月d日', { locale: zhCN }));
const displayWeekday = computed(() => format(parseISO(date), 'EEEE', { locale: zhCN }));

const fetchDiary = async () => {
  try {
    const response = await api.get(`/diaries/${date}`);
    diary.value = { ...response.data, images: response.data.images || [] };
  } catch (error: any) {
    if (error.response?.status === 404) notFound.value = true;
    else console.error('Failed to load diary:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchDiary);
</script>

<template>
  <div class="detail-page">
    <div v-if="loading" class="detail-loading"><Loader2 class="h-7 w-7 animate-spin" /></div>

    <div v-else-if="notFound" class="empty-detail surface-card">
      <span><CalendarDays class="h-6 w-6" /></span>
      <p class="eyebrow">{{ displayDate }}</p>
      <h1>这一天还没有记录</h1>
      <p>现在写下它，给未来留一个可以回来的地方。</p>
      <button @click="router.replace(`/editor/${date}`)"><Pencil class="h-4 w-4" />开始记录</button>
    </div>

    <template v-else-if="diary">
      <header class="detail-header">
        <button class="back-button" aria-label="返回" @click="router.back()"><ArrowLeft class="h-4 w-4" />返回</button>
        <button class="edit-button" @click="router.push(`/editor/${date}`)"><Pencil class="h-4 w-4" />编辑这篇</button>
      </header>

      <article class="diary-sheet surface-card">
        <div class="date-block">
          <span class="mood">{{ diary.mood_emoji || '📝' }}</span>
          <p class="eyebrow">{{ displayWeekday }}</p>
          <h1>{{ displayDate }}</h1>
          <small v-if="diary.updated_at">最后更新于 {{ format(new Date(diary.updated_at), 'HH:mm') }}</small>
        </div>

        <div v-if="diary.content" class="diary-prose" v-html="renderedContent"></div>
        <p v-else class="mood-only">这一天没有留下文字，只记录了当时的心情。</p>

        <section v-if="diary.images.length" class="detail-gallery">
          <div><ImageIcon class="h-4 w-4" /><span>这一天的照片</span></div>
          <div class="image-grid">
            <button v-for="image in diary.images" :key="image" @click="selectedImage = image">
              <img :src="image" alt="日记照片" />
            </button>
          </div>
        </section>
      </article>
    </template>

    <Transition name="lightbox">
      <div v-if="selectedImage" class="detail-lightbox" @click="selectedImage = null">
        <img :src="selectedImage" alt="照片预览" @click.stop />
        <button aria-label="关闭预览" @click="selectedImage = null"><X class="h-5 w-5" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.detail-page { max-width: 780px; margin: 0 auto; }
.detail-loading { display: grid; min-height: 60vh; place-items: center; color: #607566; }
.detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.back-button, .edit-button { display: flex; align-items: center; gap: .45rem; border-radius: 11px; padding: .65rem .8rem; font-size: .68rem; font-weight: 700; transition: .2s; }
.back-button { color: #78837b; }
.back-button { border: 1px solid transparent; }
.back-button:hover { background: rgba(255,255,255,.42); border-color: rgba(255,255,255,.66); color: #425148; box-shadow: inset 0 1px 0 rgba(255,255,255,.82); }
.edit-button { background: linear-gradient(145deg, rgba(56,87,68,.94), rgba(82,116,91,.85)); border: 1px solid rgba(255,255,255,.3); color: white; box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 10px 24px rgba(64,93,74,.2); }
.edit-button:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 14px 30px rgba(64,93,74,.26); }
.diary-sheet { min-height: 650px; padding: clamp(2rem, 6vw, 4.5rem); background: rgba(255,254,249,.94); border-color: rgba(255,255,255,.88); box-shadow: inset 0 1px 0 white, 0 24px 65px rgba(48,61,52,.11); -webkit-backdrop-filter: none; backdrop-filter: none; }
.date-block { border-bottom: 1px solid #e9ece6; padding-bottom: 1.6rem; text-align: center; }
.date-block .mood { display: grid; width: 48px; height: 48px; margin: 0 auto 1rem; place-items: center; border: 1px solid rgba(255,255,255,.8); border-radius: 15px; background: linear-gradient(145deg, rgba(235,243,235,.86), rgba(255,255,255,.68)); box-shadow: inset 0 1px 0 rgba(255,255,255,.96), 0 9px 24px rgba(50,72,56,.08); font-size: 1.45rem; }
.date-block h1 { margin-top: .4rem; font-family: Georgia, "Songti SC", serif; font-size: clamp(1.8rem, 5vw, 2.6rem); font-weight: 600; letter-spacing: -.035em; color: #2e3932; }
.date-block small { display: block; margin-top: .65rem; color: #a0a6a2; font-size: .55rem; }
.diary-prose { padding: 2.2rem 0; color: #3e4841; font-family: Georgia, "Songti SC", "STSong", serif; font-size: 1.04rem; line-height: 2; overflow-wrap: anywhere; }
.diary-prose :deep(p) { margin: 0 0 1.3em; }
.diary-prose :deep(h1), .diary-prose :deep(h2), .diary-prose :deep(h3) { margin: 1.6em 0 .7em; color: #2d3931; font-family: inherit; font-weight: 700; line-height: 1.4; }
.diary-prose :deep(h1) { font-size: 1.5rem; }
.diary-prose :deep(h2) { font-size: 1.3rem; }
.diary-prose :deep(h3) { font-size: 1.15rem; }
.diary-prose :deep(ul), .diary-prose :deep(ol) { margin: 1rem 0; padding-left: 1.4rem; }
.diary-prose :deep(ul) { list-style: disc; }
.diary-prose :deep(ol) { list-style: decimal; }
.diary-prose :deep(blockquote) { margin: 1.5rem 0; border-left: 3px solid #a8b9ab; padding: .4rem 0 .4rem 1rem; color: #758078; font-style: italic; }
.diary-prose :deep(code) { border-radius: 5px; padding: .12rem .3rem; background: #eef1ec; font-family: ui-monospace, monospace; font-size: .85em; }
.diary-prose :deep(a) { color: #456550; text-decoration: underline; text-underline-offset: 3px; }
.mood-only { padding: 4rem 0; color: #9aa19c; text-align: center; font-family: Georgia, "Songti SC", serif; font-size: .9rem; font-style: italic; }
.detail-gallery { border-top: 1px solid #e9ece6; padding-top: 1.3rem; }
.detail-gallery > div:first-child { display: flex; align-items: center; gap: .45rem; margin-bottom: .8rem; color: #69766d; font-size: .65rem; font-weight: 700; }
.image-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .6rem; }
.image-grid button { aspect-ratio: 1; overflow: hidden; border-radius: 14px; background: #edf0eb; }
.image-grid img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s; }
.image-grid button:hover img { transform: scale(1.035); }
.empty-detail { display: flex; min-height: 520px; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
.empty-detail > span { display: grid; width: 52px; height: 52px; margin-bottom: 1rem; place-items: center; border: 1px solid rgba(255,255,255,.72); border-radius: 16px; background: rgba(255,255,255,.48); color: #587160; box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 9px 24px rgba(48,68,53,.08); }
.empty-detail h1 { margin-top: .5rem; font-family: Georgia, "Songti SC", serif; font-size: 1.5rem; }
.empty-detail > p:not(.eyebrow) { margin: .7rem 0 1.2rem; color: #909893; font-size: .75rem; }
.empty-detail > button { display: flex; align-items: center; gap: .4rem; border-radius: 11px; padding: .7rem 1rem; background: #405d4a; color: white; font-size: .7rem; font-weight: 700; }
.detail-lightbox { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 3rem; background: rgba(28,34,30,.72); backdrop-filter: blur(16px); }
.detail-lightbox img { max-width: 100%; max-height: 100%; border-radius: 18px; box-shadow: 0 25px 80px rgba(0,0,0,.3); }
.detail-lightbox button { position: fixed; top: 1.5rem; right: 1.5rem; display: grid; width: 42px; height: 42px; place-items: center; border-radius: 13px; background: rgba(255,255,255,.16); color: white; }
.lightbox-enter-active, .lightbox-leave-active { transition: opacity .2s ease; }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }
@media (max-width: 640px) {
  .detail-header { margin-top: -.5rem; }
  .diary-sheet { min-height: calc(100vh - 10rem); padding: 2rem 1.35rem; }
  .image-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .detail-lightbox { padding: 1rem; }
}
</style>

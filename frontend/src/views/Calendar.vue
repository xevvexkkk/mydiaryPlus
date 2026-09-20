<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isToday,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowRight, ChevronLeft, ChevronRight, Feather, Search, Sparkles } from 'lucide-vue-next';
import api from '../utils/api';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import PhotoViewer from '../components/PhotoViewer.vue';

interface DiarySummary {
  id: number;
  date: string;
  content: string;
  mood_emoji: string;
  images?: string[];
}

const router = useRouter();
const authStore = useAuthStore();
const currentDate = ref(new Date());
const diaries = ref<Record<string, string>>({});
const recentDiaries = ref<DiarySummary[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const nextCursor = ref<string | null>(null);
const timelineLoaded = ref(false);
const loadTrigger = ref<HTMLElement | null>(null);
const previewImages = ref<string[]>([]);
const previewIndex = ref(0);
let timelineObserver: IntersectionObserver | null = null;

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const monthEntryCount = computed(() => Object.keys(diaries.value).length);
const todayDate = format(new Date(), 'yyyy-MM-dd');
const hasTodayEntry = computed(() => Boolean(diaries.value[todayDate]));

const fetchMonthDiaries = async () => {
  const yearMonth = format(currentDate.value, 'yyyy-MM');
  loading.value = true;
  try {
    const res = await api.get(`/diaries/month/${yearMonth}`);
    diaries.value = Object.fromEntries(
      res.data.map((diary: { date: string; mood_emoji: string }) => [diary.date, diary.mood_emoji]),
    );
  } catch (err) {
    console.error('Failed to fetch month diaries:', err);
  } finally {
    loading.value = false;
  }
};

const fetchTimeline = async () => {
  if (loadingMore.value || (timelineLoaded.value && !nextCursor.value)) return;
  loadingMore.value = true;
  try {
    const res = await api.get('/diaries/timeline', {
      params: { limit: 6, ...(nextCursor.value ? { before: nextCursor.value } : {}) },
    });
    recentDiaries.value.push(...res.data.items);
    nextCursor.value = res.data.nextCursor;
    timelineLoaded.value = true;
  } catch (err) {
    console.error('Failed to fetch timeline:', err);
  } finally {
    loadingMore.value = false;
  }
};

const handleDayClick = (date: Date) => {
  const dateKey = format(date, 'yyyy-MM-dd');
  router.push(diaries.value[dateKey] ? `/diary/${dateKey}` : `/editor/${dateKey}`);
};
const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
const daysInMonth = computed(() => eachDayOfInterval({ start: startOfMonth(currentDate.value), end: endOfMonth(currentDate.value) }));
const paddingStart = computed(() => {
  const day = getDay(startOfMonth(currentDate.value));
  return day === 0 ? 6 : day - 1;
});
const isFuture = (date: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};
const getPreview = (content: string) => {
  const text = (content || '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/[#*`_>\[\]]/g, '').trim();
  return text || '这一天只留下了一个心情。';
};
const getDiaryImages = (diary: DiarySummary) => {
  const storedImages = Array.isArray(diary.images) ? diary.images : [];
  const markdownImages = Array.from((diary.content || '').matchAll(/!\[.*?\]\((.*?)\)/g))
    .map(match => match[1])
    .filter(Boolean);
  return Array.from(new Set([...storedImages, ...markdownImages]));
};
const formatDateLocal = (date: string) => format(parseISO(date), 'M月d日 · EEEE', { locale: zhCN });

const openImagePreview = (diary: DiarySummary, index: number) => {
  previewImages.value = getDiaryImages(diary);
  previewIndex.value = index;
};

const closeImagePreview = () => {
  previewImages.value = [];
  previewIndex.value = 0;
};

watch(currentDate, fetchMonthDiaries);
onMounted(() => {
  fetchMonthDiaries();
  fetchTimeline().then(async () => {
    await nextTick();
    timelineObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && nextCursor.value) fetchTimeline();
    }, { rootMargin: '240px 0px' });
    if (loadTrigger.value) timelineObserver.observe(loadTrigger.value);
  });
});

onBeforeUnmount(() => {
  timelineObserver?.disconnect();
});
</script>

<template>
  <div class="space-y-9">
    <header class="dashboard-heading">
      <div>
        <p class="eyebrow">{{ format(new Date(), 'yyyy年 M月d日 · EEEE', { locale: zhCN }) }}</p>
        <h1>{{ greeting }}，{{ authStore.user?.username }}</h1>
        <p>今天有什么值得被记住？</p>
      </div>
      <button class="desktop-search hidden sm:flex" @click="router.push('/search')">
        <Search class="h-4 w-4" />
        搜索你的回忆
        <kbd>⌘ K</kbd>
      </button>
    </header>

    <section class="reflection-card">
      <div class="reflection-copy">
        <span class="reflection-icon"><Sparkles class="h-5 w-5" /></span>
        <div>
          <p class="eyebrow">今日片刻</p>
          <h2>{{ hasTodayEntry ? '继续写下今天的故事' : '给今天留下一点痕迹' }}</h2>
          <p>{{ hasTodayEntry ? '你的记录会自动保存，可以随时回来补充。' : '不必写得完整，一句话、一个心情也足够。' }}</p>
        </div>
      </div>
      <button @click="router.push(`/editor/${todayDate}`)">
        <Feather class="h-4 w-4" />
        {{ hasTodayEntry ? '继续书写' : '开始记录' }}
      </button>
    </section>

    <div class="dashboard-grid">
      <section class="surface-card calendar-card">
        <div class="calendar-head">
          <div>
            <p class="eyebrow">日历</p>
            <div class="flex items-baseline gap-2">
              <h2>{{ format(currentDate, 'M月', { locale: zhCN }) }}</h2>
              <span>{{ format(currentDate, 'yyyy') }}</span>
            </div>
          </div>
          <div class="calendar-controls">
            <button aria-label="上个月" @click="currentDate = subMonths(currentDate, 1)"><ChevronLeft class="h-4 w-4" /></button>
            <button
              aria-label="下个月"
              :disabled="isSameMonth(currentDate, new Date())"
              @click="currentDate = addMonths(currentDate, 1)"
            ><ChevronRight class="h-4 w-4" /></button>
          </div>
        </div>

        <div class="calendar-grid">
          <div v-for="day in weekDays" :key="day" class="weekday">{{ day }}</div>
          <div v-for="i in paddingStart" :key="`pad-${i}`"></div>
          <button
            v-for="date in daysInMonth"
            :key="date.toISOString()"
            :disabled="isFuture(date)"
            :class="['calendar-day', { today: isToday(date), recorded: diaries[format(date, 'yyyy-MM-dd')] }]"
            @click="handleDayClick(date)"
          >
            <span>{{ format(date, 'd') }}</span>
            <small v-if="diaries[format(date, 'yyyy-MM-dd')]">{{ diaries[format(date, 'yyyy-MM-dd')] }}</small>
          </button>
        </div>

        <footer class="calendar-footer">
          <span><i></i> 本月记录 {{ monthEntryCount }} 天</span>
          <span v-if="loading">正在更新…</span>
        </footer>
      </section>

      <section class="recent-section">
        <div class="section-title">
          <div>
            <p class="eyebrow">时间线</p>
            <h2>最近记录</h2>
          </div>
          <button @click="router.push('/search')">查看全部 <ArrowRight class="h-4 w-4" /></button>
        </div>

        <div v-if="recentDiaries.length" class="timeline-list">
          <article v-for="diary in recentDiaries" :key="diary.id" @click="router.push(`/diary/${diary.date}`)">
            <div class="timeline-date">
              <strong>{{ format(parseISO(diary.date), 'dd') }}</strong>
              <span>{{ format(parseISO(diary.date), 'MMM', { locale: zhCN }) }}</span>
            </div>
            <div class="timeline-line"><i></i></div>
            <div class="timeline-content">
              <div class="flex items-center justify-between gap-3">
                <time>{{ formatDateLocal(diary.date) }}</time>
                <span class="mood-chip">{{ diary.mood_emoji || '📝' }}</span>
              </div>
              <p>{{ getPreview(diary.content) }}</p>
              <div
                v-if="getDiaryImages(diary).length"
                :class="['timeline-gallery', `photos-${Math.min(getDiaryImages(diary).length, 3)}`]"
              >
                <button
                  v-for="(image, index) in getDiaryImages(diary).slice(0, 3)"
                  :key="image"
                  type="button"
                  class="timeline-photo"
                  aria-label="查看日记照片"
                  @click.stop="openImagePreview(diary, index)"
                >
                  <img :src="image" alt="日记照片" loading="lazy" decoding="async" />
                  <span v-if="index === 2 && getDiaryImages(diary).length > 3" class="photo-more">
                    +{{ getDiaryImages(diary).length - 3 }}
                  </span>
                </button>
              </div>
            </div>
          </article>
          <div ref="loadTrigger" class="timeline-loader">
            <span v-if="loadingMore"><span class="loader-dot"></span>正在翻阅更早的记录…</span>
            <span v-else-if="!nextCursor && recentDiaries.length">已经看到最早的一篇了</span>
          </div>
        </div>

        <div v-else-if="timelineLoaded" class="empty-journal surface-card">
          <span><Feather class="h-6 w-6" /></span>
          <h3>你的故事从今天开始</h3>
          <p>写下第一篇日记，未来的你会感谢现在的记录。</p>
          <button @click="router.push(`/editor/${todayDate}`)">写第一篇日记</button>
        </div>
      </section>
    </div>

    <PhotoViewer
      v-if="previewImages.length"
      :images="previewImages"
      :initial-index="previewIndex"
      @close="closeImagePreview"
    />
  </div>
</template>

<style scoped>
.dashboard-heading { display: flex; align-items: end; justify-content: space-between; gap: 2rem; }
.dashboard-heading h1 { margin-top: .45rem; font-family: Georgia, "Songti SC", serif; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.1; letter-spacing: -.035em; color: #273229; }
.dashboard-heading > div > p:last-child { margin-top: .65rem; color: #7c857f; font-size: .9rem; }
.desktop-search { align-items: center; gap: .65rem; min-width: 250px; border: 1px solid rgba(255,255,255,.72); background: rgba(255,255,255,.38); color: #7e8982; border-radius: 15px; padding: .7rem .8rem; font-size: .78rem; box-shadow: inset 0 1px 0 rgba(255,255,255,.85), 0 12px 34px rgba(47,66,53,.08); backdrop-filter: blur(18px) saturate(155%); transition: all .2s; }
.desktop-search:hover { background: rgba(255,255,255,.58); color: #4a5c51; transform: translateY(-1px); }
.desktop-search kbd { margin-left: auto; border: 1px solid rgba(255,255,255,.72); border-radius: 7px; padding: .1rem .35rem; background: rgba(255,255,255,.38); font-size: .65rem; box-shadow: inset 0 1px 0 rgba(255,255,255,.7); }
.reflection-card { display: flex; align-items: center; justify-content: space-between; gap: 2rem; overflow: hidden; position: relative; border-radius: 26px; padding: 1.5rem 1.7rem; background: linear-gradient(125deg, rgba(223,238,226,.64), rgba(255,255,255,.32)); border: 1px solid rgba(255,255,255,.76); box-shadow: inset 0 1px 0 rgba(255,255,255,.88), 0 18px 52px rgba(45,66,51,.1); backdrop-filter: blur(26px) saturate(160%); }
.reflection-card::before { content: ''; position: absolute; inset: 1px 8% auto; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.92), transparent); }
.reflection-card::after { content: ''; position: absolute; width: 240px; height: 240px; right: -90px; top: -100px; border: 1px solid rgba(255,255,255,.36); border-radius: 50%; box-shadow: 0 0 0 35px rgba(255,255,255,.1), 0 0 0 70px rgba(255,255,255,.06); }
.reflection-copy { display: flex; align-items: center; gap: 1rem; position: relative; z-index: 1; }
.reflection-icon { display: grid; width: 44px; height: 44px; place-items: center; flex: 0 0 auto; border-radius: 14px; background: rgba(255,255,255,.48); border: 1px solid rgba(255,255,255,.76); color: #53705c; box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 20px rgba(52,76,59,.08); }
.reflection-copy h2 { margin-top: .25rem; font-family: Georgia, "Songti SC", serif; font-size: 1.25rem; font-weight: 600; color: #304137; }
.reflection-copy > div > p:last-child { margin-top: .25rem; font-size: .76rem; color: #78877d; }
.reflection-card > button { position: relative; z-index: 1; display: flex; align-items: center; gap: .5rem; flex: 0 0 auto; border-radius: 13px; padding: .7rem 1rem; background: linear-gradient(145deg, rgba(56,88,68,.94), rgba(82,116,91,.84)); border: 1px solid rgba(255,255,255,.32); color: white; font-size: .78rem; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 10px 24px rgba(55,84,66,.18); transition: all .2s; }
.reflection-card > button:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.34), 0 14px 28px rgba(55,84,66,.24); }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 2rem; align-items: start; }
.calendar-card { padding: 1.5rem; }
.calendar-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.calendar-head h2 { margin-top: .25rem; font-family: Georgia, "Songti SC", serif; font-size: 1.55rem; font-weight: 600; color: #2e3a31; }
.calendar-head span { color: #a0a6a1; font-size: .75rem; }
.calendar-controls { display: flex; gap: .35rem; }
.calendar-controls button { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; color: #6e7771; transition: .2s; }
.calendar-controls button { border: 1px solid transparent; }
.calendar-controls button:hover:not(:disabled) { background: rgba(255,255,255,.46); border-color: rgba(255,255,255,.68); color: #3f5146; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.calendar-controls button:disabled { opacity: .25; cursor: not-allowed; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: .32rem; text-align: center; }
.weekday { padding-bottom: .5rem; color: #a0a6a2; font-size: .62rem; font-weight: 700; }
.calendar-day { position: relative; display: flex; aspect-ratio: 1; min-width: 0; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px; color: #5d675f; transition: all .18s; }
.calendar-day span { font-size: .75rem; font-weight: 600; line-height: 1; }
.calendar-day small { position: absolute; bottom: 2px; font-size: .58rem; }
.calendar-day:hover:not(:disabled) { background: rgba(255,255,255,.48); color: #34503e; box-shadow: inset 0 1px 0 rgba(255,255,255,.84); }
.calendar-day.today { background: linear-gradient(145deg, rgba(59,90,70,.94), rgba(81,116,90,.86)); border: 1px solid rgba(255,255,255,.3); color: white; box-shadow: inset 0 1px 0 rgba(255,255,255,.28), 0 8px 18px rgba(64,93,74,.22); }
.calendar-day.recorded:not(.today) { background: rgba(255,255,255,.34); border: 1px solid rgba(255,255,255,.52); }
.calendar-day:disabled { opacity: .25; cursor: not-allowed; }
.calendar-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 1.2rem; border-top: 1px solid #eef0eb; padding-top: 1rem; color: #959c97; font-size: .65rem; }
.calendar-footer span { display: flex; align-items: center; gap: .4rem; }
.calendar-footer i { width: 6px; height: 6px; border-radius: 50%; background: #64806c; }
.recent-section { min-width: 0; }
.section-title { display: flex; align-items: end; justify-content: space-between; margin-bottom: 1rem; padding: 0 .2rem; }
.section-title h2 { margin-top: .2rem; font-family: Georgia, "Songti SC", serif; font-size: 1.45rem; font-weight: 600; }
.section-title button { display: flex; align-items: center; gap: .25rem; color: #66766b; font-size: .72rem; font-weight: 600; }
.section-title button:hover { color: #385342; }
.timeline-list article { display: grid; grid-template-columns: 42px 18px minmax(0,1fr); cursor: pointer; }
.timeline-date { padding-top: .8rem; text-align: center; color: #727c75; }
.timeline-date strong { display: block; font-family: Georgia, serif; font-size: 1.2rem; line-height: 1; }
.timeline-date span { display: block; margin-top: .25rem; font-size: .55rem; text-transform: uppercase; }
.timeline-line { position: relative; display: flex; justify-content: center; }
.timeline-line::before { content: ''; width: 1px; height: 100%; background: #dde2dc; }
.timeline-line i { position: absolute; top: 1.05rem; width: 7px; height: 7px; border: 2px solid #f7f6f1; border-radius: 50%; background: #718877; box-shadow: 0 0 0 1px #718877; }
.timeline-content { margin: 0 0 .7rem .65rem; border: 1px solid rgba(255,255,255,.68); border-radius: 18px; padding: .9rem 1rem; background: linear-gradient(145deg, rgba(255,255,255,.5), rgba(248,251,247,.26)); box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 10px 30px rgba(48,66,53,.055); backdrop-filter: blur(18px) saturate(145%); transition: all .2s; }
.timeline-list article:hover .timeline-content { transform: translateX(4px) translateY(-1px); background: rgba(255,255,255,.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 14px 34px rgba(48,66,53,.1); }
.timeline-content time { color: #929994; font-size: .62rem; font-weight: 600; }
.timeline-content p { margin-top: .45rem; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: #4e5851; font-family: Georgia, "Songti SC", serif; font-size: .88rem; line-height: 1.65; }
.mood-chip { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 9px; background: rgba(255,255,255,.46); border: 1px solid rgba(255,255,255,.66); box-shadow: inset 0 1px 0 rgba(255,255,255,.8); font-size: .85rem; }
.timeline-gallery { display: grid; gap: .35rem; overflow: hidden; margin-top: .7rem; border-radius: 13px; }
.timeline-gallery.photos-1 { grid-template-columns: 1fr; }
.timeline-gallery.photos-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.timeline-gallery.photos-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.timeline-photo { position: relative; display: block; overflow: hidden; width: 100%; aspect-ratio: 1; background: #e9ede8; cursor: zoom-in; }
.photos-1 .timeline-photo { aspect-ratio: 16 / 9; max-height: 190px; }
.photos-2 .timeline-photo { aspect-ratio: 4 / 3; }
.timeline-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s ease; }
.timeline-list article:hover .timeline-photo img { transform: scale(1.025); }
.photo-more { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(30,39,33,.52); color: white; font-size: 1rem; font-weight: 700; backdrop-filter: blur(2px); }
.timeline-loader { min-height: 46px; padding: .8rem 0 .2rem 60px; color: #a0a7a2; text-align: center; font-size: .6rem; }
.timeline-loader > span { display: inline-flex; align-items: center; gap: .45rem; }
.loader-dot { width: 7px; height: 7px; border-radius: 50%; background: #718877; animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .25; transform: scale(.75); } }
.empty-journal { padding: 3rem 2rem; text-align: center; }
.empty-journal > span { display: grid; width: 48px; height: 48px; margin: 0 auto 1rem; place-items: center; border-radius: 15px; background: #eaf0e9; color: #56705e; }
.empty-journal h3 { font-family: Georgia, "Songti SC", serif; font-size: 1.15rem; }
.empty-journal p { margin: .5rem auto 1rem; max-width: 260px; color: #8a928c; font-size: .75rem; line-height: 1.6; }
.empty-journal button { color: #46604f; font-size: .75rem; font-weight: 700; }
@media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .dashboard-heading h1 { font-size: 2rem; }
  .reflection-card { align-items: flex-start; flex-direction: column; gap: 1.15rem; padding: 1.25rem; }
  .reflection-icon { display: none; }
  .reflection-card > button { width: 100%; justify-content: center; }
  .calendar-card { padding: 1.15rem; }
  .calendar-grid { gap: .16rem; }
  .calendar-day { border-radius: 10px; }
}
</style>

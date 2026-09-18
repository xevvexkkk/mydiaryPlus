<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { format, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import api from '../utils/api';
import { ArrowRight, Feather, Loader2, Search as SearchIcon, X } from 'lucide-vue-next';

interface SearchResult {
  id: number;
  date: string;
  content: string;
  mood_emoji: string;
  images?: string[];
}

const route = useRoute();
const router = useRouter();
const results = ref<SearchResult[]>([]);
const loading = ref(false);
const searchQuery = ref((route.query.q as string) || '');

const handleSearch = () => {
  const q = searchQuery.value.trim();
  router.replace(q ? { path: '/search', query: { q } } : { path: '/search' });
};

const clearSearch = () => {
  searchQuery.value = '';
  router.replace('/search');
};

const fetchResults = async (q: string) => {
  if (!q) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await api.get('/diaries/search', { params: { q } });
    results.value = res.data;
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const previewParts = (content: string, query: string) => {
  const plain = (content || '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/[#*`_>\[\]]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 180);
  if (!query) return [{ text: plain, match: false }];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return plain.split(regex).filter(Boolean).map((text) => ({
    text,
    match: text.toLocaleLowerCase() === query.toLocaleLowerCase(),
  }));
};

watch(() => route.query.q, (newQuery) => {
  searchQuery.value = (newQuery as string) || '';
  fetchResults(searchQuery.value);
});

onMounted(() => fetchResults(searchQuery.value));
</script>

<template>
  <div class="search-page">
    <header class="search-heading">
      <p class="eyebrow">记忆检索</p>
      <h1>找回某个片刻</h1>
      <p>输入文字，翻阅曾经写下的心情与故事。</p>
    </header>

    <form class="search-box" @submit.prevent="handleSearch">
      <SearchIcon class="h-5 w-5" />
      <input v-model="searchQuery" type="search" autocomplete="off" autofocus placeholder="例如：旅行、生日、一个人的名字…" />
      <button v-if="searchQuery" type="button" class="clear-button" aria-label="清空" @click="clearSearch"><X class="h-4 w-4" /></button>
      <button type="submit" class="submit-button">搜索</button>
    </form>

    <div v-if="route.query.q" class="result-summary">
      <span>“{{ route.query.q }}”</span>
      <p>{{ loading ? '正在翻阅…' : `找到 ${results.length} 条相关记录` }}</p>
    </div>

    <div v-if="loading" class="search-state">
      <Loader2 class="h-7 w-7 animate-spin" />
      <p>正在翻阅你的记录</p>
    </div>

    <div v-else-if="!route.query.q" class="search-state surface-card">
      <span><SearchIcon class="h-6 w-6" /></span>
      <h2>从一个关键词开始</h2>
      <p>日记正文中的每一段文字都可以被找到。</p>
    </div>

    <div v-else-if="results.length === 0" class="search-state surface-card">
      <span><Feather class="h-6 w-6" /></span>
      <h2>还没有找到这段记忆</h2>
      <p>试试更短的词语，或换一种说法。</p>
    </div>

    <div v-else class="result-list">
      <article v-for="diary in results" :key="diary.id" @click="router.push(`/diary/${diary.date}`)">
        <div class="result-date">
          <strong>{{ format(parseISO(diary.date), 'dd') }}</strong>
          <span>{{ format(parseISO(diary.date), 'yyyy · MM') }}</span>
        </div>
        <div class="result-copy">
          <div>
            <time>{{ format(parseISO(diary.date), 'EEEE', { locale: zhCN }) }}</time>
            <span>{{ diary.mood_emoji || '📝' }}</span>
          </div>
          <p>
            <template v-for="(part, index) in previewParts(diary.content, route.query.q as string)" :key="index">
              <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
            </template>
          </p>
          <small v-if="diary.images?.length">包含 {{ diary.images.length }} 张照片</small>
        </div>
        <ArrowRight class="result-arrow h-5 w-5" />
      </article>
    </div>
  </div>
</template>

<style scoped>
.search-page { max-width: 850px; margin: 0 auto; }
.search-heading { text-align: center; }
.search-heading h1 { margin-top: .45rem; font-family: Georgia, "Songti SC", serif; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.15; letter-spacing: -.035em; }
.search-heading > p:last-child { margin-top: .7rem; color: #858e88; font-size: .85rem; }
.search-box { display: flex; align-items: center; gap: .75rem; margin-top: 2.3rem; border: 1px solid rgba(255,255,255,.76); border-radius: 20px; padding: .55rem .6rem .55rem 1rem; background: linear-gradient(145deg, rgba(255,255,255,.58), rgba(248,251,247,.3)); color: #849087; box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 16px 46px rgba(48,61,52,.1); backdrop-filter: blur(24px) saturate(160%); transition: all .2s; }
.search-box:focus-within { background: rgba(255,255,255,.66); box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 18px 50px rgba(55,75,62,.13), 0 0 0 4px rgba(255,255,255,.24); }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #344038; font-size: .9rem; }
.search-box input::-webkit-search-cancel-button { display: none; }
.clear-button { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 9px; transition: .2s; }
.clear-button:hover { background: rgba(255,255,255,.48); color: #435248; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.submit-button { border-radius: 13px; padding: .65rem 1.15rem; background: linear-gradient(145deg, rgba(57,88,69,.94), rgba(83,117,92,.84)); border: 1px solid rgba(255,255,255,.3); color: white; font-size: .75rem; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255,255,255,.28), 0 8px 20px rgba(58,87,69,.18); transition: .2s; }
.submit-button:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.32), 0 11px 24px rgba(58,87,69,.24); }
.result-summary { display: flex; align-items: center; justify-content: space-between; margin: 2.2rem 0 1rem; }
.result-summary span { color: #37453b; font-family: Georgia, "Songti SC", serif; font-size: 1.1rem; }
.result-summary p { color: #969e98; font-size: .68rem; }
.search-state { display: flex; min-height: 280px; flex-direction: column; align-items: center; justify-content: center; margin-top: 2rem; color: #78857c; text-align: center; }
.search-state > span { display: grid; width: 52px; height: 52px; margin-bottom: 1rem; place-items: center; border-radius: 16px; background: rgba(255,255,255,.46); border: 1px solid rgba(255,255,255,.7); color: #587160; box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 9px 24px rgba(48,67,53,.08); }
.search-state h2 { font-family: Georgia, "Songti SC", serif; font-size: 1.2rem; color: #3e4a42; }
.search-state p { margin-top: .5rem; color: #929a94; font-size: .75rem; }
.result-list { display: flex; flex-direction: column; gap: .75rem; }
.result-list article { display: grid; grid-template-columns: 70px minmax(0,1fr) 24px; align-items: center; gap: 1rem; cursor: pointer; border: 1px solid rgba(255,255,255,.7); border-radius: 20px; padding: 1rem 1.15rem; background: linear-gradient(145deg, rgba(255,255,255,.52), rgba(248,251,247,.27)); box-shadow: inset 0 1px 0 rgba(255,255,255,.84), 0 12px 32px rgba(48,61,52,.06); backdrop-filter: blur(20px) saturate(150%); transition: all .2s; }
.result-list article:hover { transform: translateY(-3px); background: rgba(255,255,255,.62); box-shadow: inset 0 1px 0 rgba(255,255,255,.94), 0 18px 40px rgba(48,61,52,.11); }
.result-date { border-right: 1px solid #eceee9; text-align: center; }
.result-date strong { display: block; font-family: Georgia, serif; font-size: 1.65rem; line-height: 1; color: #415148; }
.result-date span { display: block; margin-top: .35rem; color: #a0a7a2; font-size: .55rem; }
.result-copy { min-width: 0; }
.result-copy > div { display: flex; align-items: center; gap: .5rem; }
.result-copy time { color: #89928c; font-size: .62rem; font-weight: 600; }
.result-copy p { margin-top: .45rem; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: #4c5750; font-family: Georgia, "Songti SC", serif; font-size: .88rem; line-height: 1.6; }
.result-copy mark { border-radius: 3px; padding: 0 .12rem; background: #dfeadd; color: #31473a; }
.result-copy small { display: block; margin-top: .35rem; color: #a0a7a2; font-size: .58rem; }
.result-arrow { color: #b4bab5; transition: .2s; }
.result-list article:hover .result-arrow { transform: translateX(3px); color: #587160; }
@media (max-width: 640px) {
  .search-heading { text-align: left; }
  .search-box { margin-top: 1.6rem; }
  .submit-button { padding-inline: .85rem; }
  .result-list article { grid-template-columns: 50px minmax(0,1fr); gap: .8rem; padding: .9rem; }
  .result-date strong { font-size: 1.35rem; }
  .result-arrow { display: none; }
}
</style>

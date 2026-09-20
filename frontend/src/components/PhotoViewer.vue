<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, X } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  images: string[];
  initialIndex?: number;
}>(), {
  initialIndex: 0,
});

const emit = defineEmits<{
  close: [];
}>();

const stage = ref<HTMLElement | null>(null);
const currentIndex = ref(Math.min(Math.max(props.initialIndex, 0), Math.max(props.images.length - 1, 0)));
const isFitMode = ref(true);
const isLoaded = ref(false);
const isDragging = ref(false);
const naturalWidth = ref(0);
const naturalHeight = ref(0);
const panX = ref(0);
const panY = ref(0);
const currentImage = computed(() => props.images[currentIndex.value] || '');

let pointerActive = false;
let pointerStartX = 0;
let pointerStartY = 0;
let panStartX = 0;
let panStartY = 0;
let pointerMoved = false;
let suppressClick = false;
let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;
let lockedScrollY = 0;
let previousBodyStyles: Record<string, string> = {};
let previousHtmlOverflow = '';

const imageStyle = computed(() => {
  if (isFitMode.value) return undefined;
  return {
    width: `${naturalWidth.value}px`,
    height: `${naturalHeight.value}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    transform: `translate(calc(-50% + ${panX.value}px), calc(-50% + ${panY.value}px))`,
  };
});

const resetView = () => {
  isFitMode.value = true;
  panX.value = 0;
  panY.value = 0;
  isDragging.value = false;
};

const clampPan = (x: number, y: number) => {
  if (!stage.value) return { x: 0, y: 0 };
  const maxX = Math.max(0, (naturalWidth.value - stage.value.clientWidth) / 2);
  const maxY = Math.max(0, (naturalHeight.value - stage.value.clientHeight) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
};

const toggleOriginalSize = () => {
  if (suppressClick || !isLoaded.value) return;
  isFitMode.value = !isFitMode.value;
  panX.value = 0;
  panY.value = 0;
};

const showImage = (index: number) => {
  if (!props.images.length) return;
  currentIndex.value = (index + props.images.length) % props.images.length;
};

const showPrevious = () => showImage(currentIndex.value - 1);
const showNext = () => showImage(currentIndex.value + 1);

const handleImageLoad = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement;
  naturalWidth.value = image.naturalWidth;
  naturalHeight.value = image.naturalHeight;
  isLoaded.value = true;
};

const handlePointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointerActive = true;
  pointerMoved = false;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  panStartX = panX.value;
  panStartY = panY.value;
  isDragging.value = !isFitMode.value;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
};

const handlePointerMove = (event: PointerEvent) => {
  if (!pointerActive) return;
  const deltaX = event.clientX - pointerStartX;
  const deltaY = event.clientY - pointerStartY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) pointerMoved = true;
  if (isFitMode.value) return;
  const nextPan = clampPan(panStartX + deltaX, panStartY + deltaY);
  panX.value = nextPan.x;
  panY.value = nextPan.y;
};

const handlePointerUp = (event: PointerEvent) => {
  if (!pointerActive) return;
  const deltaX = event.clientX - pointerStartX;
  const deltaY = event.clientY - pointerStartY;
  pointerActive = false;
  isDragging.value = false;

  if (isFitMode.value && props.images.length > 1 && Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
    deltaX < 0 ? showNext() : showPrevious();
    pointerMoved = true;
  }

  if (pointerMoved) {
    suppressClick = true;
    if (suppressClickTimer) clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => {
      suppressClick = false;
    }, 300);
  }
};

const handleBackdropClick = () => {
  if (!suppressClick) emit('close');
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
  if (event.key === 'ArrowLeft' && isFitMode.value) showPrevious();
  if (event.key === 'ArrowRight' && isFitMode.value) showNext();
};

watch(currentImage, async () => {
  isLoaded.value = false;
  resetView();
  await nextTick();
});

watch(() => props.initialIndex, (index) => {
  showImage(index);
});

onMounted(() => {
  const body = document.body;
  lockedScrollY = window.scrollY;
  previousBodyStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  };
  previousHtmlOverflow = document.documentElement.style.overflow;
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  document.documentElement.style.overflow = 'hidden';
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  const body = document.body;
  if (suppressClickTimer) clearTimeout(suppressClickTimer);
  window.removeEventListener('keydown', handleKeydown);
  body.style.position = previousBodyStyles.position || '';
  body.style.top = previousBodyStyles.top || '';
  body.style.left = previousBodyStyles.left || '';
  body.style.right = previousBodyStyles.right || '';
  body.style.width = previousBodyStyles.width || '';
  document.documentElement.style.overflow = previousHtmlOverflow;
  window.scrollTo(0, lockedScrollY);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="stage"
      :class="['photo-viewer', { original: !isFitMode, dragging: isDragging }]"
      @click.self="handleBackdropClick"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <Loader2 v-if="!isLoaded" class="viewer-loader h-7 w-7 animate-spin" />

      <img
        :key="currentImage"
        :src="currentImage"
        :style="imageStyle"
        :class="['viewer-image', { loaded: isLoaded }]"
        alt="照片预览"
        draggable="false"
        @load="handleImageLoad"
        @click.stop="toggleOriginalSize"
      />

      <div class="viewer-toolbar" @pointerdown.stop>
        <button type="button" :aria-label="isFitMode ? '查看原始尺寸' : '适应屏幕'" @click.stop="toggleOriginalSize">
          <Maximize2 v-if="isFitMode" class="h-4 w-4" />
          <Minimize2 v-else class="h-4 w-4" />
          {{ isFitMode ? '原始尺寸' : '适应屏幕' }}
        </button>
        <button type="button" aria-label="关闭照片预览" @click.stop="emit('close')">
          <X class="h-5 w-5" />
        </button>
      </div>

      <template v-if="images.length > 1 && isFitMode">
        <button class="viewer-nav previous" type="button" aria-label="查看上一张照片" @pointerdown.stop @click.stop="showPrevious">
          <ChevronLeft class="h-6 w-6" />
        </button>
        <button class="viewer-nav next" type="button" aria-label="查看下一张照片" @pointerdown.stop @click.stop="showNext">
          <ChevronRight class="h-6 w-6" />
        </button>
      </template>

      <div class="viewer-footer" @pointerdown.stop>
        <span v-if="images.length > 1">{{ currentIndex + 1 }} / {{ images.length }}</span>
        <small>{{ isFitMode ? '点击图片查看原始尺寸 · 左右滑动切换' : '拖拽查看图片 · 点击图片恢复适应' }}</small>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.photo-viewer { position: fixed; inset: 0; z-index: 160; width: 100vw; height: 100%; height: 100dvh; overflow: hidden; overscroll-behavior: none; touch-action: none; user-select: none; background: rgba(20,26,22,.84); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
.viewer-image { position: absolute; top: 50%; left: 50%; display: block; width: auto; height: auto; max-width: calc(100vw - 11rem); max-height: calc(100vh - 7rem); max-height: calc(100dvh - 7rem); border-radius: 16px; opacity: 0; object-fit: contain; transform: translate(-50%, -50%); box-shadow: 0 25px 80px rgba(0,0,0,.34); cursor: zoom-in; transition: opacity .16s ease; -webkit-user-drag: none; }
.viewer-image.loaded { opacity: 1; }
.photo-viewer.original .viewer-image { border-radius: 0; cursor: grab; transition: opacity .16s ease; }
.photo-viewer.dragging .viewer-image { cursor: grabbing; }
.viewer-loader { position: absolute; top: 50%; left: 50%; color: rgba(255,255,255,.82); transform: translate(-50%, -50%); }
.viewer-toolbar { position: fixed; top: max(1rem, env(safe-area-inset-top)); right: 1rem; z-index: 2; display: flex; gap: .5rem; }
.viewer-toolbar button, .viewer-nav { display: flex; min-width: 42px; height: 42px; align-items: center; justify-content: center; gap: .4rem; border: 1px solid rgba(255,255,255,.2); border-radius: 13px; padding: 0 .75rem; background: rgba(255,255,255,.14); color: white; font-size: .65rem; font-weight: 600; backdrop-filter: blur(8px); }
.viewer-toolbar button:last-child { width: 42px; padding: 0; }
.viewer-nav { position: fixed; top: 50%; z-index: 2; width: 46px; height: 58px; padding: 0; transform: translateY(-50%); }
.viewer-nav.previous { left: 1.25rem; }
.viewer-nav.next { right: 1.25rem; }
.viewer-footer { position: fixed; bottom: max(1rem, env(safe-area-inset-bottom)); left: 50%; z-index: 2; display: flex; align-items: center; gap: .55rem; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: .4rem .75rem; transform: translateX(-50%); background: rgba(16,22,18,.42); color: white; white-space: nowrap; backdrop-filter: blur(8px); }
.viewer-footer span { font-size: .68rem; font-weight: 700; }
.viewer-footer small { color: rgba(255,255,255,.72); font-size: .58rem; }
@media (max-width: 640px) {
  .viewer-image { max-width: calc(100vw - 2rem); max-height: calc(100vh - 7rem); max-height: calc(100dvh - 7rem); border-radius: 12px; }
  .viewer-nav { display: none; }
  .viewer-footer { max-width: calc(100vw - 2rem); }
  .viewer-footer small { overflow: hidden; text-overflow: ellipsis; }
}
</style>

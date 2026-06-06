/**
 * FitLife Skeleton Components (Phase 3)
 * ----------------------------------------------------------------------------
 * Drop-in HTML strings for loading skeletons matching the FitLife dark theme.
 *
 *   import { skeletonCard, skeletonList, skeletonMealCard, skeletonHero, skeletonAvatar } from '../components/skeleton.js';
 *   container.innerHTML = skeletonList(4);
 */

const SHIMMER = `
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: fl-shimmer 1.4s ease-in-out infinite;
  border-radius: 10px;
`;

export const SKELETON_KEYFRAMES = `
  @keyframes fl-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .fl-skel { ${SHIMMER} }
`;

export function injectSkeletonStyles() {
  if (document.getElementById('fl-skel-style')) return;
  const s = document.createElement('style');
  s.id = 'fl-skel-style';
  s.textContent = SKELETON_KEYFRAMES;
  document.head.appendChild(s);
}

// Auto-inject when imported
if (typeof document !== 'undefined') injectSkeletonStyles();

export function skeletonLine(width = '100%', height = '14px', className = '') {
  return `<div class="fl-skel ${className}" style="width:${width}; height:${height};"></div>`;
}

export function skeletonAvatar(size = 56) {
  return `<div class="fl-skel" style="width:${size}px; height:${size}px; border-radius:50%;"></div>`;
}

export function skeletonCard() {
  return `
    <div class="rounded-2xl p-4 bg-surface-container-low border border-outline-variant/10 space-y-3">
      ${skeletonLine('60%', '16px')}
      ${skeletonLine('100%', '12px')}
      ${skeletonLine('80%', '12px')}
    </div>`;
}

export function skeletonMealCard() {
  return `
    <div class="flex items-center gap-3 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/10">
      <div class="fl-skel" style="width:56px; height:56px; border-radius:14px;"></div>
      <div class="flex-1 space-y-2">
        ${skeletonLine('70%', '14px')}
        ${skeletonLine('45%', '11px')}
      </div>
      ${skeletonLine('60px', '18px')}
    </div>`;
}

export function skeletonList(count = 3) {
  return Array.from({ length: count }).map(() => skeletonMealCard()).join('');
}

export function skeletonHero() {
  return `
    <div class="rounded-3xl p-6 bg-surface-container-low border border-outline-variant/10 space-y-4">
      ${skeletonLine('40%', '12px')}
      ${skeletonLine('70%', '24px')}
      <div class="grid grid-cols-3 gap-3">
        ${skeletonCard()}${skeletonCard()}${skeletonCard()}
      </div>
    </div>`;
}

export function skeletonChat() {
  return `
    <div class="space-y-3">
      <div class="flex justify-end"><div class="fl-skel" style="width:60%; height:42px; border-radius:18px 18px 4px 18px;"></div></div>
      <div class="flex justify-start"><div class="fl-skel" style="width:75%; height:58px; border-radius:18px 18px 18px 4px;"></div></div>
      <div class="flex justify-end"><div class="fl-skel" style="width:48%; height:38px; border-radius:18px 18px 4px 18px;"></div></div>
    </div>`;
}

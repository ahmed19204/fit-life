/**
 * FitLife Page Header Component
 * Consistent safe-area aware header across app pages.
 */

export function renderPageHeader({ title, subtitle, showBack = false, rightAction = '' }) {
  return `
    <header role="banner" class="sticky top-0 z-40 px-5 pl-safe pr-safe pt-safe pb-3 border-b border-outline-variant/10"
            style="background: rgba(14, 21, 14, 0.92); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
      <div class="flex items-center justify-between max-w-lg mx-auto pt-3">
        <div class="flex items-center gap-3 min-w-0">
          ${showBack ? `
            <button onclick="history.back()" aria-label="Go back" class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-surface-container-high/50 text-on-surface hover:bg-surface-container-highest transition-colors flex-shrink-0">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>` : ''}
          <div class="min-w-0">
            <h1 class="text-lg font-bold text-on-surface leading-tight truncate">${title}</h1>
            ${subtitle ? `<p class="text-xs text-on-surface-variant mt-0.5 truncate">${subtitle}</p>` : ''}
          </div>
        </div>
        <div class="flex-shrink-0">${rightAction}</div>
      </div>
    </header>`;
}

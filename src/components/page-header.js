/**
 * FitLife Page Header Component
 * Consistent header across app pages.
 */

export function renderPageHeader({ title, subtitle, showBack = false, rightAction = '' }) {
  return `
    <header role="banner" class="sticky top-0 z-40 px-5 pt-4 pb-3 border-b border-outline-variant/10"
            style="background: rgba(14, 21, 14, 0.92); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
      <div class="flex items-center justify-between max-w-lg mx-auto">
        <div class="flex items-center gap-3">
          ${showBack ? `
            <button onclick="history.back()" aria-label="Go back" class="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-high/50 text-on-surface hover:bg-surface-container-highest transition-colors">
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>` : ''}
          <div>
            <h1 class="text-lg font-bold text-on-surface leading-tight">${title}</h1>
            ${subtitle ? `<p class="text-xs text-on-surface-variant mt-0.5">${subtitle}</p>` : ''}
          </div>
        </div>
        ${rightAction}
      </div>
    </header>`;
}

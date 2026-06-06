import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';

export async function renderProgress() {
  const res = await getNutritionProfile();
  const p = res.data?.profile || {};
  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Body Progress', subtitle: 'Track your transformation', showBack: true })}
      <div class="px-5 py-5 space-y-5">
        <div class="p-6 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 text-center">
          <span class="material-symbols-outlined text-primary text-4xl mb-3 block" style="font-variation-settings: 'FILL' 1;">monitoring</span>
          <h3 class="text-lg font-bold mb-2">Your Stats</h3>
          <div class="grid grid-cols-3 gap-4 mt-4">
            <div><p class="text-2xl font-bold text-primary">${p.weight || '—'}</p><p class="text-[10px] text-on-surface-variant uppercase">Weight kg</p></div>
            <div><p class="text-2xl font-bold text-secondary">${p.height || '—'}</p><p class="text-[10px] text-on-surface-variant uppercase">Height cm</p></div>
            <div><p class="text-2xl font-bold text-tertiary">${p.age || '—'}</p><p class="text-[10px] text-on-surface-variant uppercase">Age</p></div>
          </div>
        </div>
        <div class="p-6 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
          <span class="material-symbols-outlined text-on-surface-variant/40 text-3xl mb-2 block">add_chart</span>
          <p class="text-sm text-on-surface-variant">Progress tracking and body composition charts coming soon</p>
        </div>
      </div>
      ${renderNavBar()}
    </div>`;
}

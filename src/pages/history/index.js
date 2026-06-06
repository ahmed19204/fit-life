import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getRecentMeals, getAnalysisHistory } from '../../services/meals.js';

export async function renderHistory() {
  const mealsRes = await getRecentMeals(30);
  const meals = mealsRes.data?.meals || [];
  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'History', subtitle: 'Your health timeline', showBack: true })}
      <div class="px-5 py-5 space-y-3">
        ${meals.length > 0 ? meals.map(m => `
          <div class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
            <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center"><span class="material-symbols-outlined text-on-surface-variant">restaurant</span></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold truncate">${m.name}</p>
              <p class="text-[10px] text-on-surface-variant">${m.type} &middot; ${new Date(m.created_at).toLocaleDateString()}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold text-primary">${m.calories}</p>
              <p class="text-[9px] text-on-surface-variant">kcal</p>
            </div>
          </div>
        `).join('') : '<div class="text-center py-12 text-on-surface-variant"><span class="material-symbols-outlined text-4xl mb-2 block">history</span><p>No meal history yet</p></div>'}
      </div>
      ${renderNavBar()}
    </div>`;
}

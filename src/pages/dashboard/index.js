/**
 * FitLife Dashboard
 * Main dashboard with safe-area aware mobile layout.
 */
import { getCurrentUser, getDisplayName } from '../../services/auth.js';
import { getNutritionProfile, checkOnboardingCompleted } from '../../services/ai.js';
import { getDailyNutritionSummary, checkDayChange } from '../../services/meals.js';
import { renderNavBar } from '../../components/nav-bar.js';
import { navigate } from '../../services/router.js';

const FOOD_ICON_MAP = [
  { keywords: ['pizza'], icon: 'local_pizza' },
  { keywords: ['burger', 'hamburger'], icon: 'lunch_dining' },
  { keywords: ['salad', 'lettuce'], icon: 'eco' },
  { keywords: ['chicken', 'turkey', 'poultry'], icon: 'kebab_dining' },
  { keywords: ['steak', 'beef', 'meat'], icon: 'restaurant' },
  { keywords: ['fish', 'salmon', 'tuna', 'sushi'], icon: 'set_meal' },
  { keywords: ['rice', 'bowl', 'quinoa'], icon: 'rice_bowl' },
  { keywords: ['soup', 'stew'], icon: 'soup_kitchen' },
  { keywords: ['cake', 'dessert', 'sweet', 'cookie'], icon: 'cake' },
  { keywords: ['smoothie', 'shake', 'juice', 'drink'], icon: 'local_drink' },
  { keywords: ['coffee', 'latte', 'tea'], icon: 'coffee' },
  { keywords: ['egg', 'omelette'], icon: 'egg_alt' },
  { keywords: ['bread', 'toast', 'sandwich', 'wrap'], icon: 'bakery_dining' },
  { keywords: ['pasta', 'spaghetti', 'noodle'], icon: 'ramen_dining' },
  { keywords: ['oats', 'oatmeal', 'cereal'], icon: 'breakfast_dining' },
];

const MEAL_TYPE_ICONS = {
  Breakfast: 'egg_alt',
  Lunch: 'lunch_dining',
  Dinner: 'dinner_dining',
  Snack: 'cookie',
};

function getMealIcon(name, type) {
  const lower = (name || '').toLowerCase();
  for (const entry of FOOD_ICON_MAP) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) return entry.icon;
  }
  return MEAL_TYPE_ICONS[type] || 'restaurant';
}

export async function renderDashboard() {
  const userRes = await getCurrentUser();
  if (!userRes.success || !userRes.data.user) {
    navigate('/auth');
    return '';
  }

  const onboarding = await checkOnboardingCompleted();
  if (!onboarding.data?.completed) {
    navigate('/welcome');
    return '';
  }

  checkDayChange();

  const user = userRes.data.user;
  const name = getDisplayName(user);
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const summaryRes = await getDailyNutritionSummary();
  const summary = summaryRes.data || {};

  const targetCal = profile.calories || 2000;
  const consumed = summary.calories || 0;
  const remaining = Math.max(0, targetCal - consumed);
  const progress = targetCal > 0 ? Math.min(100, Math.round((consumed / targetCal) * 100)) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-28 pl-safe pr-safe overflow-x-hidden">
      <header class="px-5 pl-safe pr-safe pt-safe pb-4">
        <div class="max-w-lg mx-auto pt-3 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs text-on-surface-variant font-medium uppercase tracking-wider">${greeting}</p>
            <h1 class="text-xl font-bold mt-0.5 truncate">${name.split(' ')[0]}</h1>
            <p class="text-[10px] text-on-surface-variant/60 mt-0.5">${dateStr}</p>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button onclick="window.location.hash='/notifications'" class="w-11 h-11 rounded-full bg-surface-container-high/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors relative min-h-[44px]">
              <span class="material-symbols-outlined text-xl">notifications</span>
              <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary"></div>
            </button>
            <button onclick="window.location.hash='/profile'" class="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary-container/30 flex items-center justify-center border border-primary/20 min-h-[44px]">
              <span class="text-sm font-bold text-primary">${name.charAt(0).toUpperCase()}</span>
            </button>
          </div>
        </div>
      </header>

      <div class="px-5 space-y-5 max-w-lg mx-auto">
        <div class="p-5 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.05]" style="background: radial-gradient(circle, #22c55e, transparent 70%);"></div>
          <div class="flex items-center gap-5">
            <div class="relative w-24 h-24 flex-shrink-0">
              <svg class="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(75, 226, 119, 0.1)" stroke-width="6"/>
                <circle cx="48" cy="48" r="42" fill="none" stroke="${progress > 100 ? '#ef4444' : '#22c55e'}" stroke-width="6" stroke-linecap="round"
                        stroke-dasharray="${2 * Math.PI * 42}" stroke-dashoffset="${2 * Math.PI * 42 * (1 - Math.min(progress, 100) / 100)}"
                        class="transition-all duration-1000"/>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-lg font-bold ${progress > 100 ? 'text-error' : 'text-primary'}">${progress}%</span>
                <span class="text-[8px] text-on-surface-variant uppercase">Today</span>
              </div>
            </div>
            <div class="flex-1 space-y-2 min-w-0">
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-xs text-on-surface-variant">Consumed</span>
                <span class="text-lg font-bold text-on-surface">${consumed.toLocaleString()}</span>
              </div>
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-xs text-on-surface-variant">Target</span>
                <span class="text-sm font-semibold text-on-surface-variant">${targetCal.toLocaleString()}</span>
              </div>
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-xs text-on-surface-variant">Remaining</span>
                <span class="text-sm font-semibold ${remaining === 0 ? 'text-error' : 'text-primary'}">${remaining.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-outline-variant/10">
            ${[
              { label: 'Protein', current: summary.protein || 0, target: profile.protein || 150, color: '#22c55e' },
              { label: 'Carbs', current: summary.carbs || 0, target: profile.carbs || 200, color: '#9ddf2e' },
              { label: 'Fat', current: summary.fat || 0, target: profile.fat || 65, color: '#ffb5ab' },
            ].map((macro) => `
              <div class="text-center min-w-0">
                <div class="h-1 rounded-full bg-surface-container-highest mb-1.5 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, (macro.current / Math.max(1, macro.target)) * 100)}%; background: ${macro.color};"></div>
                </div>
                <p class="text-xs font-bold" style="color: ${macro.color};">${macro.current}g</p>
                <p class="text-[9px] text-on-surface-variant truncate">${macro.label} / ${macro.target}g</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          ${[
            { icon: 'photo_camera', label: 'Scan Meal', desc: 'AI Vision', path: '/meals', color: 'primary' },
            { icon: 'restaurant_menu', label: 'AI Recipes', desc: 'Get Ideas', path: '/recipe', color: 'secondary' },
            { icon: 'calendar_today', label: 'Daily Plan', desc: 'Meal Plan', path: '/daily-meals', color: 'primary' },
            { icon: 'smart_toy', label: 'AI Coach', desc: 'Ask Anything', path: '/assistant', color: 'secondary' },
          ].map((action) => `
            <button onclick="window.location.hash='${action.path}'"
                    class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 hover:bg-surface-container/70 hover:border-primary/20 transition-all text-left group min-h-[44px]">
              <div class="w-10 h-10 rounded-lg bg-${action.color}/10 flex items-center justify-center mb-3 group-hover:bg-${action.color}/20 transition-colors">
                <span class="material-symbols-outlined text-${action.color} text-xl" style="font-variation-settings: 'FILL' 1;">${action.icon}</span>
              </div>
              <p class="text-sm font-bold text-on-surface">${action.label}</p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">${action.desc}</p>
            </button>
          `).join('')}
        </div>

        <div>
          <div class="flex items-center justify-between mb-3 gap-3">
            <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Today's Meals</h3>
            <div class="flex items-center gap-3 flex-shrink-0">
              <span class="text-[10px] text-primary font-semibold">${summary.mealCount || 0} meals</span>
              <button onclick="window.location.hash='/history'" class="text-xs text-primary font-semibold min-h-[44px]">View All</button>
            </div>
          </div>
          ${(summary.meals || []).length > 0 ? `
            <div class="space-y-2">
              ${summary.meals.slice(0, 5).map((meal) => `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 min-w-0">
                  <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">${getMealIcon(meal.name, meal.type)}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <p class="text-sm font-semibold text-on-surface truncate">${meal.name}</p>
                      ${meal.aiSuggested ? '<span class="material-symbols-outlined text-primary text-xs" style="font-variation-settings: \'FILL\' 1;">auto_awesome</span>' : ''}
                    </div>
                    <p class="text-[10px] text-on-surface-variant truncate">${meal.time || ''} &middot; ${meal.type}</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-bold text-primary">${meal.calories}</p>
                    <p class="text-[9px] text-on-surface-variant">kcal</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-6 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-3xl text-on-surface-variant/40 mb-2 block">restaurant</span>
              <p class="text-sm text-on-surface-variant">No meals logged today</p>
              <button onclick="window.location.hash='/meals'" class="mt-3 px-4 py-2 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors min-h-[44px]">
                Log Your First Meal
              </button>
            </div>
          `}
        </div>

        <button onclick="window.location.hash='/streaks'" class="w-full p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 flex items-center gap-4 hover:border-primary/20 transition-all min-h-[44px]">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-orange-400 text-2xl" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
          </div>
          <div class="flex-1 text-left min-w-0">
            <p class="text-sm font-bold text-on-surface">Track Your Streak!</p>
            <p class="text-xs text-on-surface-variant">Log meals daily to build your streak</p>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
        </button>

        <button onclick="window.location.hash='/progress'" class="w-full p-4 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-4 hover:from-primary/10 transition-all min-h-[44px]">
          <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary text-2xl" style="font-variation-settings: 'FILL' 1;">monitoring</span>
          </div>
          <div class="flex-1 text-left min-w-0">
            <p class="text-sm font-bold text-on-surface">Weekly Analytics</p>
            <p class="text-xs text-on-surface-variant">View charts, trends & progress</p>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
        </button>
      </div>

      ${renderNavBar()}
    </div>`;
}

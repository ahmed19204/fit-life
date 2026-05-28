/**
 * FitLife Dashboard
 * Main dashboard with Stitch Premium UI - command center for health metrics.
 */
import { getCurrentUser, getDisplayName } from '../../services/auth.js';
import { getNutritionProfile, checkOnboardingCompleted } from '../../services/ai.js';
import { getDailyNutritionSummary } from '../../services/meals.js';
import { renderNavBar } from '../../components/nav-bar.js';
import { navigate } from '../../services/router.js';

export async function renderDashboard() {
  // Check auth & onboarding
  const userRes = await getCurrentUser();
  if (!userRes.success || !userRes.data.user) { navigate('/auth'); return ''; }
  
  const onboarding = await checkOnboardingCompleted();
  if (!onboarding.data?.completed) { navigate('/welcome'); return ''; }

  const user = userRes.data.user;
  const name = getDisplayName(user);
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const summaryRes = await getDailyNutritionSummary();
  const summary = summaryRes.data || {};

  const targetCal = profile.calories || 2000;
  const consumed = summary.calories || 0;
  const remaining = Math.max(0, targetCal - consumed);
  const progress = Math.min(100, Math.round((consumed / targetCal) * 100));

  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      <!-- Header -->
      <header class="px-5 pt-5 pb-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-on-surface-variant font-medium uppercase tracking-wider">${greeting}</p>
            <h1 class="text-xl font-bold mt-0.5">${name.split(' ')[0]}</h1>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="window.location.hash='/notifications'" class="w-10 h-10 rounded-full bg-surface-container-high/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors relative">
              <span class="material-symbols-outlined text-xl">notifications</span>
              <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary"></div>
            </button>
            <button onclick="window.location.hash='/profile'" class="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary-container/30 flex items-center justify-center border border-primary/20">
              <span class="text-sm font-bold text-primary">${name.charAt(0).toUpperCase()}</span>
            </button>
          </div>
        </div>
      </header>

      <div class="px-5 space-y-5">
        <!-- Calorie Ring Card -->
        <div class="p-5 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.05]" style="background: radial-gradient(circle, #22c55e, transparent 70%);"></div>
          <div class="flex items-center gap-5">
            <!-- Ring -->
            <div class="relative w-24 h-24 flex-shrink-0">
              <svg class="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(75, 226, 119, 0.1)" stroke-width="6"/>
                <circle cx="48" cy="48" r="42" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="round"
                        stroke-dasharray="${2 * Math.PI * 42}" stroke-dashoffset="${2 * Math.PI * 42 * (1 - progress / 100)}"
                        class="transition-all duration-1000"/>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-lg font-bold text-primary">${progress}%</span>
                <span class="text-[8px] text-on-surface-variant uppercase">Goal</span>
              </div>
            </div>
            <!-- Stats -->
            <div class="flex-1 space-y-2">
              <div class="flex justify-between items-baseline">
                <span class="text-xs text-on-surface-variant">Consumed</span>
                <span class="text-lg font-bold text-on-surface">${consumed.toLocaleString()}</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-xs text-on-surface-variant">Target</span>
                <span class="text-sm font-semibold text-on-surface-variant">${targetCal.toLocaleString()}</span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="text-xs text-on-surface-variant">Remaining</span>
                <span class="text-sm font-semibold text-primary">${remaining.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <!-- Macro Summary -->
          <div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-outline-variant/10">
            ${[
              { label: 'Protein', current: summary.protein || 0, target: profile.protein || 150, color: '#22c55e' },
              { label: 'Carbs', current: summary.carbs || 0, target: profile.carbs || 200, color: '#9ddf2e' },
              { label: 'Fat', current: summary.fat || 0, target: profile.fat || 65, color: '#ffb5ab' },
            ].map(m => `
              <div class="text-center">
                <div class="h-1 rounded-full bg-surface-container-highest mb-1.5 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, (m.current / m.target) * 100)}%; background: ${m.color};"></div>
                </div>
                <p class="text-xs font-bold" style="color: ${m.color};">${m.current}g</p>
                <p class="text-[9px] text-on-surface-variant">${m.label} / ${m.target}g</p>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-3">
          ${[
            { icon: 'photo_camera', label: 'Scan Meal', desc: 'AI Vision', path: '/meals', color: 'primary' },
            { icon: 'restaurant_menu', label: 'AI Recipes', desc: 'Get Ideas', path: '/recipe', color: 'secondary' },
            { icon: 'calendar_today', label: 'Daily Meals', desc: 'Meal Plan', path: '/daily-meals', color: 'primary' },
            { icon: 'smart_toy', label: 'AI Coach', desc: 'Ask Anything', path: '/assistant', color: 'secondary' },
          ].map(a => `
            <button onclick="window.location.hash='${a.path}'"
                    class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 hover:bg-surface-container/70 hover:border-primary/20 transition-all text-left group">
              <div class="w-10 h-10 rounded-lg bg-${a.color}/10 flex items-center justify-center mb-3 group-hover:bg-${a.color}/20 transition-colors">
                <span class="material-symbols-outlined text-${a.color} text-xl" style="font-variation-settings: 'FILL' 1;">${a.icon}</span>
              </div>
              <p class="text-sm font-bold text-on-surface">${a.label}</p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">${a.desc}</p>
            </button>
          `).join('')}
        </div>

        <!-- Recent Meals -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Today's Meals</h3>
            <button onclick="window.location.hash='/history'" class="text-xs text-primary font-semibold">View All</button>
          </div>
          ${(summary.meals || []).length > 0 ? `
            <div class="space-y-2">
              ${summary.meals.slice(0, 3).map(m => `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
                  <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center">
                    <span class="material-symbols-outlined text-on-surface-variant text-lg">restaurant</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-on-surface truncate">${m.name}</p>
                    <p class="text-[10px] text-on-surface-variant">${m.time || 'No time'} &middot; ${m.type}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold text-primary">${m.calories}</p>
                    <p class="text-[9px] text-on-surface-variant">kcal</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-6 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-3xl text-on-surface-variant/40 mb-2 block">restaurant</span>
              <p class="text-sm text-on-surface-variant">No meals logged today</p>
              <button onclick="window.location.hash='/meals'" class="mt-3 px-4 py-2 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                Log Your First Meal
              </button>
            </div>
          `}
        </div>

        <!-- Streak Card -->
        <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center">
            <span class="material-symbols-outlined text-orange-400 text-2xl" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
          </div>
          <div class="flex-1">
            <p class="text-sm font-bold text-on-surface">Keep Your Streak!</p>
            <p class="text-xs text-on-surface-variant">Log meals daily to build your streak</p>
          </div>
          <button onclick="window.location.hash='/streaks'" class="text-primary">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

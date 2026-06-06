/**
 * FitLife Streaks & Achievements Page
 * Gamification: daily streaks, badges, milestones, and achievement tracking.
 */
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';
import { getRecentMeals } from '../../services/meals.js';

const ACHIEVEMENTS = [
  { icon: 'local_fire_department', title: 'First Flame', desc: 'Log meals for 3 consecutive days', threshold: 3, color: 'from-orange-500/20 to-orange-600/10', iconColor: 'text-orange-400' },
  { icon: 'bolt', title: 'Week Warrior', desc: 'Complete a full week of logging', threshold: 7, color: 'from-yellow-500/20 to-yellow-600/10', iconColor: 'text-yellow-400' },
  { icon: 'diamond', title: 'Diamond Streak', desc: 'Maintain a 30-day streak', threshold: 30, color: 'from-cyan-400/20 to-cyan-500/10', iconColor: 'text-cyan-400' },
  { icon: 'military_tech', title: 'Elite Tracker', desc: 'Log 100 total meals', threshold: 100, color: 'from-primary/20 to-primary-container/10', iconColor: 'text-primary' },
  { icon: 'psychology', title: 'AI Explorer', desc: 'Generate your first AI meal plan', threshold: 1, color: 'from-purple-500/20 to-purple-600/10', iconColor: 'text-purple-400' },
  { icon: 'target', title: 'Goal Crusher', desc: 'Hit your calorie target 10 times', threshold: 10, color: 'from-primary/20 to-secondary/10', iconColor: 'text-secondary' },
];

export async function renderStreaks() {
  const mealsRes = await getRecentMeals(100);
  const meals = mealsRes.data?.meals || [];
  const totalMeals = meals.length;

  const profileRes = await getNutritionProfile();
  const hasProfile = profileRes.data?.profile?.onboarding_completed;

  // Calculate streak (simplified: count consecutive days from today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  const daySet = new Set();
  meals.forEach(m => {
    const d = new Date(m.created_at);
    d.setHours(0, 0, 0, 0);
    daySet.add(d.toISOString());
  });

  for (let i = 0; i < 365; i++) {
    const check = new Date(today);
    check.setDate(check.getDate() - i);
    check.setHours(0, 0, 0, 0);
    if (daySet.has(check.toISOString())) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  // Calculate weekly activity (last 7 days)
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekActivity = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    weekActivity.push({
      day: weekDays[d.getDay()],
      active: daySet.has(d.toISOString()),
      isToday: i === 0,
    });
  }

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-8">
      ${renderPageHeader({ title: 'Streaks & Achievements', showBack: true })}

      <div class="px-5 py-5 space-y-5">
        <!-- Streak Hero -->
        <div class="p-6 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 text-center relative overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"></div>
          <div class="relative">
            <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mx-auto mb-3 border border-orange-500/20"
                 style="box-shadow: 0 0 40px rgba(249, 115, 22, 0.15);">
              <span class="material-symbols-outlined text-orange-400 text-4xl" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
            </div>
            <p class="text-5xl font-extrabold text-on-surface mb-1">${streak}</p>
            <p class="text-sm text-on-surface-variant font-medium">Day${streak !== 1 ? 's' : ''} Streak</p>
            ${streak === 0 ? '<p class="text-xs text-on-surface-variant/60 mt-1">Log a meal today to start your streak!</p>' : ''}
          </div>
        </div>

        <!-- Weekly Activity -->
        <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
          <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">This Week</h3>
          <div class="flex items-center justify-between">
            ${weekActivity.map(d => `
              <div class="flex flex-col items-center gap-1.5">
                <div class="w-9 h-9 rounded-full flex items-center justify-center ${d.active ? 'bg-primary text-on-primary' : d.isToday ? 'border-2 border-primary/40 bg-surface-container' : 'bg-surface-container-high/50'} transition-all">
                  ${d.active ? '<span class="material-symbols-outlined text-sm" style="font-variation-settings: \'FILL\' 1;">check</span>' : ''}
                </div>
                <span class="text-[10px] ${d.isToday ? 'text-primary font-bold' : 'text-on-surface-variant'}">${d.day}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
          ${[
            { label: 'Total Meals', value: totalMeals, icon: 'restaurant' },
            { label: 'Best Streak', value: `${streak}d`, icon: 'emoji_events' },
            { label: 'Active Days', value: daySet.size, icon: 'calendar_month' },
          ].map(s => `
            <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-primary text-lg mb-1 block">${s.icon}</span>
              <p class="text-lg font-bold text-on-surface">${s.value}</p>
              <p class="text-[10px] text-on-surface-variant">${s.label}</p>
            </div>
          `).join('')}
        </div>

        <!-- Achievements -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Achievements</h3>
          <div class="space-y-2">
            ${ACHIEVEMENTS.map(ach => {
              let progress = 0;
              if (ach.title === 'Elite Tracker') progress = Math.min(100, Math.round((totalMeals / ach.threshold) * 100));
              else if (ach.title === 'AI Explorer') progress = hasProfile ? 100 : 0;
              else if (ach.title.includes('Streak') || ach.title.includes('Flame') || ach.title.includes('Warrior'))
                progress = Math.min(100, Math.round((streak / ach.threshold) * 100));
              else progress = Math.min(100, Math.round((totalMeals / ach.threshold) * 100));
              const unlocked = progress >= 100;

              return `
                <div class="flex items-center gap-3 p-3 rounded-xl border ${unlocked ? 'border-primary/20 bg-primary/5' : 'border-outline-variant/10 bg-surface-container-low/30'} transition-all">
                  <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${ach.color} flex items-center justify-center flex-shrink-0 ${unlocked ? '' : 'opacity-50'}">
                    <span class="material-symbols-outlined ${ach.iconColor} text-2xl" style="font-variation-settings: 'FILL' 1;">${ach.icon}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-bold text-on-surface truncate">${ach.title}</p>
                      ${unlocked ? '<span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: \'FILL\' 1;">verified</span>' : ''}
                    </div>
                    <p class="text-[10px] text-on-surface-variant">${ach.desc}</p>
                    ${!unlocked ? `
                      <div class="mt-1.5 h-1 rounded-full bg-surface-container-highest overflow-hidden">
                        <div class="h-full rounded-full bg-primary/60 transition-all" style="width: ${progress}%;"></div>
                      </div>
                    ` : ''}
                  </div>
                  <span class="text-xs font-bold ${unlocked ? 'text-primary' : 'text-on-surface-variant'}">${unlocked ? 'Unlocked' : `${progress}%`}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

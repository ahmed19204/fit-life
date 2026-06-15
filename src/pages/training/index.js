/**
 * FitLife Training Performance Page
 * Workout tracking, exercise library, and performance analytics.
 * 
 * NOTE: Currently uses static placeholder data for workouts and weekly stats.
 * TODO: Integrate with Supabase workouts table when backend is ready.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';

const WORKOUT_TYPES = [
  { icon: 'fitness_center', label: 'Strength', color: 'primary', desc: 'Weight training & resistance' },
  { icon: 'directions_run', label: 'Cardio', color: 'secondary', desc: 'Running, cycling & HIIT' },
  { icon: 'self_improvement', label: 'Flexibility', color: 'tertiary', desc: 'Yoga, stretching & mobility' },
  { icon: 'pool', label: 'Swimming', color: 'primary', desc: 'Pool & open water' },
];

const RECENT_WORKOUTS = [
  { name: 'Upper Body Strength', type: 'Strength', duration: '45 min', cal: 320, date: 'Today' },
  { name: 'Morning Run', type: 'Cardio', duration: '30 min', cal: 280, date: 'Yesterday' },
  { name: 'Yoga Flow', type: 'Flexibility', duration: '25 min', cal: 150, date: '2 days ago' },
];

const WEEKLY_STATS = [
  { day: 'M', value: 45, active: true },
  { day: 'T', value: 30, active: true },
  { day: 'W', value: 0, active: false },
  { day: 'T', value: 60, active: true },
  { day: 'F', value: 25, active: true },
  { day: 'S', value: 0, active: false },
  { day: 'S', value: 0, active: false },
];

export async function renderTraining() {
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const activityLevel = profile.activity_level || 'moderately-active';
  const maxBarValue = Math.max(...WEEKLY_STATS.map(s => s.value), 1);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-28 pl-safe pr-safe">
      ${renderPageHeader({ title: 'Training', subtitle: 'Track your workouts', showBack: true })}

      <div class="px-5 py-5 space-y-5">
        <!-- Weekly Overview -->
        <div class="p-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-xs text-on-surface-variant uppercase tracking-wider">This Week</p>
              <p class="text-2xl font-bold text-on-surface">4 <span class="text-sm text-on-surface-variant font-normal">workouts</span></p>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant">Total Time</p>
              <p class="text-lg font-bold text-primary">2h 40m</p>
            </div>
          </div>

          <!-- Bar Chart -->
          <div class="flex items-end justify-between gap-2 h-24">
            ${WEEKLY_STATS.map(s => `
              <div class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full rounded-t-md transition-all duration-500 ${s.active ? 'bg-gradient-to-t from-primary-container to-primary' : 'bg-surface-container-high/40'}"
                     style="height: ${s.value > 0 ? Math.max(8, (s.value / maxBarValue) * 80) : 4}px;"></div>
                <span class="text-[9px] ${s.active ? 'text-primary font-semibold' : 'text-on-surface-variant'}">${s.day}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-3 gap-3">
          ${[
            { label: 'Calories Burned', value: '750', unit: 'kcal', icon: 'local_fire_department', color: 'tertiary' },
            { label: 'Activity Level', value: activityLevel.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), unit: '', icon: 'speed', color: 'primary' },
            { label: 'Avg Duration', value: '33', unit: 'min', icon: 'schedule', color: 'secondary' },
          ].map(s => `
            <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-${s.color} text-lg mb-1 block">${s.icon}</span>
              <p class="text-sm font-bold text-on-surface">${s.value}</p>
              <p class="text-[9px] text-on-surface-variant">${s.unit ? s.unit + ' &middot; ' : ''}${s.label}</p>
            </div>
          `).join('')}
        </div>

        <!-- Workout Types -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Start a Workout</h3>
          <div class="grid grid-cols-2 gap-3">
            ${WORKOUT_TYPES.map(w => `
              <button class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 hover:border-primary/20 hover:bg-surface-container/70 transition-all text-left group">
                <div class="w-10 h-10 rounded-lg bg-${w.color}/10 flex items-center justify-center mb-2 group-hover:bg-${w.color}/20 transition-colors">
                  <span class="material-symbols-outlined text-${w.color} text-xl" style="font-variation-settings: 'FILL' 1;">${w.icon}</span>
                </div>
                <p class="text-sm font-bold text-on-surface">${w.label}</p>
                <p class="text-[10px] text-on-surface-variant mt-0.5">${w.desc}</p>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Recent Workouts -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Recent Workouts</h3>
          </div>
          <div class="space-y-2">
            ${RECENT_WORKOUTS.map(w => `
              <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">
                    ${w.type === 'Strength' ? 'fitness_center' : w.type === 'Cardio' ? 'directions_run' : 'self_improvement'}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-on-surface truncate">${w.name}</p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] text-on-surface-variant">${w.duration}</span>
                    <span class="text-[10px] text-on-surface-variant">&middot;</span>
                    <span class="text-[10px] text-primary">${w.cal} kcal</span>
                  </div>
                </div>
                <span class="text-[10px] text-on-surface-variant/60">${w.date}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- AI Training Suggestion -->
        <div class="p-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
            </div>
            <div class="flex-1">
              <p class="text-sm font-bold text-on-surface">AI Training Advisor</p>
              <p class="text-[10px] text-on-surface-variant">Get personalized workout suggestions based on your goals</p>
            </div>
            <button onclick="window.location.hash='/assistant'" class="text-primary">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

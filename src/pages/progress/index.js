/**
 * FitLife Body Progress & Analytics
 * Real weekly/monthly charts, calorie trends, macro breakdown,
 * consistency scoring, and weight tracking.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';
import { getWeeklyAnalytics, getMonthlyAnalytics } from '../../services/meals.js';

function drawBarChart(canvasId, labels, values, color, maxVal) {
  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;

    const max = maxVal || Math.max(...values, 1);
    const barWidth = (cw - 40) / labels.length - 6;
    const startX = 20;
    const chartH = ch - 30;

    ctx.clearRect(0, 0, cw, ch);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = chartH - (chartH * i / 4);
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(cw - 10, y);
      ctx.stroke();
    }

    // Draw bars with animation
    values.forEach((v, i) => {
      const barH = (v / max) * (chartH - 10);
      const x = startX + i * ((cw - 40) / labels.length) + 3;
      const y = chartH - barH;
      
      // Bar gradient
      const grad = ctx.createLinearGradient(x, y, x, chartH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '40');
      ctx.fillStyle = grad;
      
      // Rounded top bar
      const radius = Math.min(barWidth / 2, 4);
      ctx.beginPath();
      ctx.moveTo(x, chartH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, chartH);
      ctx.closePath();
      ctx.fill();

      // Value label
      if (v > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(v, x + barWidth / 2, y - 4);
      }

      // Day label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '500 8px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, ch - 5);
    });
  }, 100);
}

export async function renderProgress() {
  const [profileRes, weeklyRes, monthlyRes] = await Promise.all([
    getNutritionProfile(),
    getWeeklyAnalytics(),
    getMonthlyAnalytics(),
  ]);

  const p = profileRes.data?.profile || {};
  const weekly = weeklyRes.data || { days: [], activeDays: 0, avgCalories: 0, avgProtein: 0, totalMeals: 0 };
  const monthly = monthlyRes.data || { weeks: [], totalMeals: 0 };

  const targetCal = p.calories || 2000;
  const consistencyScore = Math.round((weekly.activeDays / 7) * 100);

  // Calculate weekly avg macros
  const weekDays = weekly.days || [];
  const activeDaysData = weekDays.filter(d => d.mealCount > 0);
  const avgCarbs = activeDaysData.length > 0 ? Math.round(activeDaysData.reduce((s, d) => s + d.carbs, 0) / activeDaysData.length) : 0;
  const avgFat = activeDaysData.length > 0 ? Math.round(activeDaysData.reduce((s, d) => s + d.fat, 0) / activeDaysData.length) : 0;

  // Schedule chart drawing after DOM render
  setTimeout(() => {
    drawBarChart(
      'calorieChart',
      weekDays.map(d => d.dayLabel),
      weekDays.map(d => d.calories),
      '#22c55e',
      Math.max(targetCal * 1.2, ...weekDays.map(d => d.calories))
    );
    drawBarChart(
      'proteinChart',
      weekDays.map(d => d.dayLabel),
      weekDays.map(d => d.protein),
      '#9ddf2e',
      Math.max((p.protein || 150) * 1.2, ...weekDays.map(d => d.protein))
    );
  }, 50);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-28 pl-safe pr-safe">
      ${renderPageHeader({ title: 'Progress & Analytics', subtitle: 'Track your transformation', showBack: true })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- Body Stats -->
        <div class="p-5 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">Your Stats</h3>
          <div class="grid grid-cols-3 gap-4">
            <div class="text-center">
              <p class="text-2xl font-bold text-primary">${p.weight || '—'}</p>
              <p class="text-[10px] text-on-surface-variant uppercase">Weight kg</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-secondary">${p.height || '—'}</p>
              <p class="text-[10px] text-on-surface-variant uppercase">Height cm</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-tertiary">${p.age || '—'}</p>
              <p class="text-[10px] text-on-surface-variant uppercase">Age</p>
            </div>
          </div>
          ${p.weight && p.height ? `
            <div class="mt-3 pt-3 border-t border-outline-variant/10 text-center">
              <p class="text-xs text-on-surface-variant">BMI: <span class="font-bold text-primary">${(p.weight / ((p.height / 100) ** 2)).toFixed(1)}</span></p>
            </div>
          ` : ''}
        </div>

        <!-- Consistency Score -->
        <div class="p-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.06]" style="background: radial-gradient(circle, #22c55e, transparent);"></div>
          <div class="flex items-center gap-5 relative z-10">
            <div class="relative w-20 h-20 flex-shrink-0">
              <svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(75, 226, 119, 0.1)" stroke-width="6"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="round"
                        stroke-dasharray="${2 * Math.PI * 34}" stroke-dashoffset="${2 * Math.PI * 34 * (1 - consistencyScore / 100)}"/>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-lg font-bold text-primary">${consistencyScore}%</span>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-bold text-on-surface">Weekly Consistency</h3>
              <p class="text-xs text-on-surface-variant mt-1">${weekly.activeDays}/7 active days this week</p>
              <p class="text-xs text-on-surface-variant">${weekly.totalMeals} meals logged</p>
            </div>
          </div>
        </div>

        <!-- Weekly Summary Cards -->
        <div class="grid grid-cols-2 gap-3">
          ${[
            { label: 'Avg Calories', value: weekly.avgCalories, unit: 'kcal', target: targetCal, color: 'primary' },
            { label: 'Avg Protein', value: weekly.avgProtein, unit: 'g', target: p.protein || 150, color: 'secondary' },
            { label: 'Avg Carbs', value: avgCarbs, unit: 'g', target: p.carbs || 200, color: 'primary' },
            { label: 'Avg Fat', value: avgFat, unit: 'g', target: p.fat || 65, color: 'tertiary' },
          ].map(s => {
            const pct = s.target > 0 ? Math.min(100, Math.round((s.value / s.target) * 100)) : 0;
            return `
              <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
                <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">${s.label}</p>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-lg font-bold text-${s.color}">${s.value}</span>
                  <span class="text-[10px] text-on-surface-variant">${s.unit}</span>
                </div>
                <div class="h-1 rounded-full bg-surface-container-highest mt-2 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700 bg-${s.color}" style="width: ${pct}%;"></div>
                </div>
                <p class="text-[9px] text-on-surface-variant mt-1">${pct}% of ${s.target}${s.unit} target</p>
              </div>`;
          }).join('')}
        </div>

        <!-- Calorie Chart -->
        <div class="p-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Calorie Trend</h3>
            <span class="text-[10px] text-primary font-semibold">Last 7 Days</span>
          </div>
          <div class="relative" style="height: 140px;">
            <canvas id="calorieChart" class="w-full h-full"></canvas>
          </div>
          <div class="mt-2 flex items-center justify-center gap-4 text-[10px] text-on-surface-variant">
            <span>Target: <span class="text-primary font-bold">${targetCal} kcal</span></span>
            <span>Avg: <span class="font-bold">${weekly.avgCalories} kcal</span></span>
          </div>
        </div>

        <!-- Protein Chart -->
        <div class="p-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Protein Trend</h3>
            <span class="text-[10px] text-secondary font-semibold">Last 7 Days</span>
          </div>
          <div class="relative" style="height: 140px;">
            <canvas id="proteinChart" class="w-full h-full"></canvas>
          </div>
          <div class="mt-2 flex items-center justify-center gap-4 text-[10px] text-on-surface-variant">
            <span>Target: <span class="text-secondary font-bold">${p.protein || 150}g</span></span>
            <span>Avg: <span class="font-bold">${weekly.avgProtein}g</span></span>
          </div>
        </div>

        <!-- Monthly Overview -->
        <div class="p-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Monthly Overview</h3>
          ${(monthly.weeks || []).length > 0 ? `
            <div class="space-y-3">
              ${monthly.weeks.map((w, i) => `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-lowest/50 border border-outline-variant/5">
                  <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-bold text-primary">W${i + 1}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold text-on-surface truncate">${w.label}</p>
                    <p class="text-[10px] text-on-surface-variant">${w.activeDays} active days &middot; ${w.mealCount} meals</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold text-primary">${w.mealCount > 0 ? Math.round(w.calories / Math.max(1, w.activeDays)) : 0}</p>
                    <p class="text-[9px] text-on-surface-variant">avg cal/day</p>
                  </div>
                </div>
              `).join('')}
            </div>
            <p class="text-[10px] text-on-surface-variant text-center mt-3">${monthly.totalMeals} total meals logged this month</p>
          ` : `
            <div class="text-center py-4">
              <p class="text-xs text-on-surface-variant">Start logging meals to see monthly trends</p>
            </div>
          `}
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-3">
          <button onclick="window.location.hash='/meals'" class="p-3 rounded-xl border border-primary/20 bg-primary/5 text-center hover:bg-primary/10 transition-all">
            <span class="material-symbols-outlined text-primary text-xl mb-1 block" style="font-variation-settings: 'FILL' 1;">add_circle</span>
            <p class="text-xs font-bold text-on-surface">Log Meal</p>
          </button>
          <button onclick="window.location.hash='/profile'" class="p-3 rounded-xl border border-secondary/20 bg-secondary/5 text-center hover:bg-secondary/10 transition-all">
            <span class="material-symbols-outlined text-secondary text-xl mb-1 block" style="font-variation-settings: 'FILL' 1;">scale</span>
            <p class="text-xs font-bold text-on-surface">Update Weight</p>
          </button>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

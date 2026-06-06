/**
 * FitLife Daily AI Meals Page
 * Shows the user's AI-generated daily meal plan with timing, macros, and meal details.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';
import { getDailyNutritionSummary } from '../../services/meals.js';

export async function renderDailyMeals() {
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const summaryRes = await getDailyNutritionSummary();
  const summary = summaryRes.data || {};

  const mealPlan = profile.meal_plan || [];
  const consumed = summary.calories || 0;
  const target = profile.calories || 2000;
  const remaining = Math.max(0, target - consumed);

  const mealIcons = {
    'Breakfast': 'egg_alt',
    'Morning Snack': 'coffee',
    'Lunch': 'lunch_dining',
    'Afternoon Snack': 'local_cafe',
    'Dinner': 'dinner_dining',
    'Evening Snack': 'nightlight',
  };

  const mealTimes = {
    'Breakfast': '7:00 AM',
    'Morning Snack': '10:00 AM',
    'Lunch': '12:30 PM',
    'Afternoon Snack': '3:30 PM',
    'Dinner': '7:00 PM',
    'Evening Snack': '9:00 PM',
  };

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Daily Meal Plan', subtitle: 'AI-optimized for your goals', showBack: true })}

      <div class="px-5 py-5 space-y-5">
        <!-- Daily Summary -->
        <div class="p-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-xs text-on-surface-variant uppercase tracking-wider">Today's Target</p>
              <p class="text-2xl font-bold text-on-surface">${target.toLocaleString()} <span class="text-sm text-on-surface-variant font-normal">kcal</span></p>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant">Remaining</p>
              <p class="text-lg font-bold text-primary">${remaining.toLocaleString()} kcal</p>
            </div>
          </div>
          <div class="h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r from-primary-container to-primary transition-all duration-700"
                 style="width: ${Math.min(100, Math.round((consumed / target) * 100))}%;"></div>
          </div>
          <div class="flex justify-between mt-2 text-[10px] text-on-surface-variant">
            <span>${consumed} consumed</span>
            <span>${Math.min(100, Math.round((consumed / target) * 100))}%</span>
          </div>
        </div>

        <!-- Macro Targets -->
        <div class="grid grid-cols-3 gap-3">
          ${[
            { label: 'Protein', value: profile.protein || 0, unit: 'g', color: 'primary', icon: 'fitness_center' },
            { label: 'Carbs', value: profile.carbs || 0, unit: 'g', color: 'secondary', icon: 'grain' },
            { label: 'Fat', value: profile.fat || 0, unit: 'g', color: 'tertiary', icon: 'water_drop' },
          ].map(m => `
            <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-${m.color} text-lg mb-1 block">${m.icon}</span>
              <p class="text-lg font-bold text-${m.color}">${m.value}${m.unit}</p>
              <p class="text-[10px] text-on-surface-variant">${m.label}</p>
            </div>
          `).join('')}
        </div>

        <!-- Meal Plan Timeline -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Your Meals</h3>
          ${mealPlan.length > 0 ? `
            <div class="space-y-3">
              ${mealPlan.map((meal, i) => `
                <div class="relative pl-8">
                  <!-- Timeline dot -->
                  <div class="absolute left-0 top-4 w-5 h-5 rounded-full border-2 border-primary bg-surface flex items-center justify-center z-10">
                    <div class="w-2 h-2 rounded-full bg-primary"></div>
                  </div>
                  ${i < mealPlan.length - 1 ? '<div class="absolute left-[9px] top-8 bottom-0 w-px bg-outline-variant/20"></div>' : ''}
                  
                  <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 hover:border-primary/20 transition-all">
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">${mealIcons[meal.name] || 'restaurant'}</span>
                        <div>
                          <p class="text-sm font-bold text-on-surface">${meal.name}</p>
                          <p class="text-[10px] text-on-surface-variant">${mealTimes[meal.name] || ''}</p>
                        </div>
                      </div>
                      <div class="text-right">
                        <p class="text-sm font-bold text-primary">${meal.calories || 0}</p>
                        <p class="text-[9px] text-on-surface-variant">kcal</p>
                      </div>
                    </div>
                    
                    <!-- Foods -->
                    ${(meal.foods || []).length > 0 ? `
                      <div class="mt-2 pt-2 border-t border-outline-variant/10 space-y-1.5">
                        ${meal.foods.map(food => `
                          <div class="flex items-center gap-2">
                            <span class="w-1 h-1 rounded-full bg-primary/60 flex-shrink-0"></span>
                            <span class="text-xs text-on-surface-variant">${food}</span>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                    
                    <!-- Meal Macros -->
                    <div class="flex gap-3 mt-2 pt-2 border-t border-outline-variant/10">
                      <span class="text-[10px] text-on-surface-variant">P: <span class="text-primary font-semibold">${meal.protein || 0}g</span></span>
                      <span class="text-[10px] text-on-surface-variant">C: <span class="text-secondary font-semibold">${meal.carbs || 0}g</span></span>
                      <span class="text-[10px] text-on-surface-variant">F: <span class="text-tertiary font-semibold">${meal.fat || 0}g</span></span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-8 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <span class="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">calendar_today</span>
              <h4 class="text-lg font-bold mb-2">No Meal Plan Yet</h4>
              <p class="text-sm text-on-surface-variant mb-4">Complete your onboarding to get a personalized AI meal plan.</p>
              <button onclick="window.location.hash='/onboarding'" 
                      class="px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:bg-primary transition-colors">
                Create My Plan
              </button>
            </div>
          `}
        </div>

        <!-- Regenerate Button -->
        ${mealPlan.length > 0 ? `
          <button onclick="window.location.hash='/onboarding'"
                  class="w-full py-3 rounded-xl border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-lg">refresh</span>
            Regenerate Meal Plan
          </button>
        ` : ''}
      </div>

      ${renderNavBar()}
    </div>`;
}

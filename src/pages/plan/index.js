/**
 * FitLife AI Plan Result Page
 * Displays deterministic daily targets plus AI-personalized meal structure.
 */

export function renderPlan() {
  let planData = {};
  try {
    planData = JSON.parse(sessionStorage.getItem('fitlife-plan') || '{}');
  } catch {
    planData = {};
  }

  const calories = planData.calories || 2000;
  const protein = planData.protein || 150;
  const carbs = planData.carbs || 200;
  const fat = planData.fat || 65;
  const meals = Array.isArray(planData.meal_plan) ? planData.meal_plan : [];

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-28 pl-safe pr-safe overflow-x-hidden">
      <header class="px-5 pl-safe pr-safe pt-safe pb-4 text-center relative">
        <div class="pt-3 max-w-lg mx-auto relative z-10">
          <div class="absolute inset-0 overflow-hidden pointer-events-none -z-10">
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] rounded-full opacity-[0.08]"
                 style="background: radial-gradient(circle, #22c55e 0%, transparent 70%);"></div>
          </div>
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
            <span class="text-xs font-semibold text-primary uppercase tracking-wider">AI-Personalized Plan</span>
          </div>
          <h1 class="text-2xl font-bold mb-1">Your Personalized Plan</h1>
          <p class="text-sm text-on-surface-variant">Deterministic targets with AI meal ideas tailored to your profile</p>
        </div>
      </header>

      <div class="px-5 space-y-5 max-w-lg mx-auto">
        <div class="p-5 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.05]"
               style="background: radial-gradient(circle, #22c55e, transparent 70%);"></div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Daily Targets</h3>

          <div class="text-center mb-5">
            <p class="text-4xl font-bold text-primary">${calories.toLocaleString()}</p>
            <p class="text-xs text-on-surface-variant uppercase tracking-wider mt-1">Calories per Day</p>
          </div>

          <div class="grid grid-cols-3 gap-4">
            ${[
              { label: 'Protein', value: protein, unit: 'g', color: '#22c55e' },
              { label: 'Carbs', value: carbs, unit: 'g', color: '#9ddf2e' },
              { label: 'Fat', value: fat, unit: 'g', color: '#ffb5ab' },
            ].map((macro) => `
              <div class="text-center min-w-0">
                <p class="text-xl font-bold" style="color: ${macro.color};">${macro.value}${macro.unit}</p>
                <p class="text-[10px] text-on-surface-variant uppercase tracking-wider mt-0.5">${macro.label}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Meal Plan</h3>
          <div class="space-y-3">
            ${meals.length > 0 ? meals.map((meal, index) => `
              <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
                <div class="flex items-center justify-between gap-3 mb-2">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span class="text-sm font-bold text-primary">${index + 1}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-bold text-on-surface truncate">${meal.name}</p>
                      <p class="text-xs text-on-surface-variant">${meal.calories} kcal</p>
                    </div>
                  </div>
                  <div class="flex gap-3 text-[10px] text-on-surface-variant flex-shrink-0">
                    <span>P: ${meal.protein}g</span>
                    <span>C: ${meal.carbs}g</span>
                    <span>F: ${meal.fat}g</span>
                  </div>
                </div>
                ${meal.foods?.length > 0 ? `
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    ${meal.foods.map((food) => `<span class="px-2 py-1 rounded-full bg-surface-container-high/50 text-[10px] text-on-surface-variant">${food}</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('') : `
              <div class="text-center py-8 text-on-surface-variant">
                <span class="material-symbols-outlined text-3xl mb-2 block">restaurant</span>
                <p class="text-sm">Plan details will appear here</p>
              </div>
            `}
          </div>
        </div>
      </div>

      <div class="fixed bottom-0 left-0 right-0 px-5 pl-safe pr-safe pb-safe py-4 border-t border-outline-variant/10"
           style="background: rgba(14, 21, 14, 0.95); backdrop-filter: blur(16px);">
        <div class="max-w-lg mx-auto">
          <button onclick="window.location.hash='/dashboard'"
                  class="w-full py-3.5 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-h-[44px]">
            Go to Dashboard
            <span class="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>`;
}

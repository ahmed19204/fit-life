/**
 * FitLife Meal History
 * Grouped by date, food type icons/emojis, delete capability, daily totals.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getRecentMeals, deleteMeal } from '../../services/meals.js';

// Food type → Material icon mapping for visual meal representation
const MEAL_TYPE_ICONS = {
  'Breakfast': 'egg_alt',
  'Lunch': 'lunch_dining',
  'Dinner': 'dinner_dining',
  'Snack': 'cookie',
  'Meal': 'restaurant',
};

// Food name keywords → icon for visual context (Feature 3: visual meal representation)
const FOOD_ICON_MAP = [
  { keywords: ['pizza'], icon: 'local_pizza' },
  { keywords: ['burger', 'hamburger'], icon: 'lunch_dining' },
  { keywords: ['salad', 'lettuce'], icon: 'eco' },
  { keywords: ['chicken', 'turkey', 'poultry'], icon: 'kebab_dining' },
  { keywords: ['steak', 'beef', 'meat'], icon: 'restaurant' },
  { keywords: ['fish', 'salmon', 'tuna', 'sushi'], icon: 'set_meal' },
  { keywords: ['rice', 'bowl', 'quinoa'], icon: 'rice_bowl' },
  { keywords: ['soup', 'stew'], icon: 'soup_kitchen' },
  { keywords: ['cake', 'dessert', 'sweet', 'cookie', 'brownie'], icon: 'cake' },
  { keywords: ['smoothie', 'shake', 'juice', 'drink'], icon: 'local_drink' },
  { keywords: ['coffee', 'latte', 'espresso', 'tea'], icon: 'coffee' },
  { keywords: ['egg', 'omelette', 'omelet'], icon: 'egg_alt' },
  { keywords: ['bread', 'toast', 'sandwich', 'wrap'], icon: 'bakery_dining' },
  { keywords: ['pasta', 'spaghetti', 'noodle'], icon: 'ramen_dining' },
  { keywords: ['fruit', 'apple', 'banana', 'berry'], icon: 'nutrition' },
  { keywords: ['yogurt', 'dairy', 'milk', 'cheese'], icon: 'icecream' },
  { keywords: ['oats', 'oatmeal', 'cereal', 'granola'], icon: 'breakfast_dining' },
];

function getMealIcon(name, type) {
  const lower = (name || '').toLowerCase();
  for (const entry of FOOD_ICON_MAP) {
    if (entry.keywords.some(k => lower.includes(k))) return entry.icon;
  }
  return MEAL_TYPE_ICONS[type] || 'restaurant';
}

function groupByDate(meals) {
  const groups = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  meals.forEach(m => {
    const d = new Date(m.created_at);
    d.setHours(0, 0, 0, 0);
    let label;
    if (d.getTime() === today.getTime()) label = 'Today';
    else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const key = d.toISOString();
    if (!groups[key]) groups[key] = { label, meals: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
    groups[key].meals.push(m);
    groups[key].totals.calories += m.calories || 0;
    groups[key].totals.protein += m.protein || 0;
    groups[key].totals.carbs += m.carbs || 0;
    groups[key].totals.fat += m.fat || 0;
  });

  return Object.values(groups);
}

function setupHistoryHandlers() {
  window._deleteHistoryMeal = async (id) => {
    if (!confirm('Delete this meal?')) return;
    const btn = document.getElementById(`del-${id}`);
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-xs">progress_activity</span>';
    
    const result = await deleteMeal(id);
    if (result.success) {
      const el = document.getElementById(`meal-${id}`);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 200);
      }
    } else {
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-xs">delete</span>';
    }
  };
}

export async function renderHistory() {
  const mealsRes = await getRecentMeals(50);
  const meals = mealsRes.data?.meals || [];
  const groups = groupByDate(meals);

  setTimeout(setupHistoryHandlers, 50);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Meal History', subtitle: `${meals.length} meals logged`, showBack: true })}
      <div class="px-5 py-5 space-y-5">
        ${groups.length > 0 ? groups.map(group => `
          <!-- Date Group -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">${group.label}</h3>
              <div class="flex items-center gap-3 text-[10px] text-on-surface-variant">
                <span class="font-semibold text-primary">${group.totals.calories} kcal</span>
                <span>P: ${group.totals.protein}g</span>
                <span>C: ${group.totals.carbs}g</span>
                <span>F: ${group.totals.fat}g</span>
              </div>
            </div>
            <div class="space-y-2">
              ${group.meals.map(m => `
                <div id="meal-${m.id}" class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 transition-all duration-200" style="transition: opacity 0.2s, transform 0.2s;">
                  <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">${getMealIcon(m.name, m.type)}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <p class="text-sm font-semibold truncate">${m.name}</p>
                      ${m.aiSuggested ? '<span class="material-symbols-outlined text-primary text-xs" title="AI Analyzed" style="font-variation-settings: \'FILL\' 1;">auto_awesome</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[10px] text-on-surface-variant">${m.type}</span>
                      <span class="text-[10px] text-on-surface-variant">${m.time || ''}</span>
                      <span class="text-[10px] text-on-surface-variant/60">P:${m.protein}g C:${m.carbs}g F:${m.fat}g</span>
                    </div>
                  </div>
                  <div class="text-right flex items-center gap-2">
                    <div>
                      <p class="text-sm font-bold text-primary">${m.calories}</p>
                      <p class="text-[9px] text-on-surface-variant">kcal</p>
                    </div>
                    <button id="del-${m.id}" onclick="window._deleteHistoryMeal && window._deleteHistoryMeal('${m.id}')"
                            class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all">
                      <span class="material-symbols-outlined text-xs">delete</span>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('') : `
          <div class="text-center py-16">
            <span class="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">history</span>
            <p class="text-sm text-on-surface-variant mb-1">No meal history yet</p>
            <p class="text-xs text-on-surface-variant/60 mb-4">Start logging meals to track your nutrition</p>
            <button onclick="window.location.hash='/meals'" class="px-5 py-2.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              Log Your First Meal
            </button>
          </div>
        `}
      </div>
      ${renderNavBar()}
    </div>`;
}

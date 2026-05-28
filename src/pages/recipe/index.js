/**
 * FitLife AI Recipe Generator
 * Generate personalized recipes based on user preferences and available ingredients.
 * 
 * NOTE: AI recipe generation from ingredients is gated behind Premium.
 * Sample recipes shown are curated static data. Full AI generation coming with Premium tier.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';

const RECIPE_CATEGORIES = [
  { id: 'breakfast', icon: 'egg_alt', label: 'Breakfast', color: 'primary' },
  { id: 'lunch', icon: 'lunch_dining', label: 'Lunch', color: 'secondary' },
  { id: 'dinner', icon: 'dinner_dining', label: 'Dinner', color: 'primary' },
  { id: 'snack', icon: 'cookie', label: 'Snacks', color: 'tertiary' },
  { id: 'smoothie', icon: 'local_drink', label: 'Smoothies', color: 'secondary' },
  { id: 'dessert', icon: 'cake', label: 'Healthy Desserts', color: 'tertiary' },
];

const SAMPLE_RECIPES = [
  { name: 'Protein Power Bowl', time: '15 min', cal: 420, protein: 35, difficulty: 'Easy', category: 'lunch', image: 'lunch_dining' },
  { name: 'Green Goddess Smoothie', time: '5 min', cal: 280, protein: 22, difficulty: 'Easy', category: 'smoothie', image: 'blender' },
  { name: 'Grilled Chicken Salad', time: '20 min', cal: 380, protein: 40, difficulty: 'Easy', category: 'dinner', image: 'restaurant' },
  { name: 'Overnight Oats', time: '5 min', cal: 320, protein: 18, difficulty: 'Easy', category: 'breakfast', image: 'breakfast_dining' },
  { name: 'Turkey Avocado Wrap', time: '10 min', cal: 450, protein: 30, difficulty: 'Easy', category: 'lunch', image: 'kebab_dining' },
  { name: 'Greek Yogurt Parfait', time: '5 min', cal: 220, protein: 20, difficulty: 'Easy', category: 'snack', image: 'icecream' },
];

function setupRecipeHandlers() {
  let activeCategory = 'all';

  window._filterRecipes = (query) => {
    const q = query.toLowerCase();
    document.querySelectorAll('.recipe-card').forEach(card => {
      const name = card.querySelector('.text-sm.font-bold')?.textContent?.toLowerCase() || '';
      card.style.display = name.includes(q) ? '' : 'none';
    });
  };

  window._filterCategory = (catId) => {
    activeCategory = catId;
    // Update active button styles
    document.querySelectorAll('[id^="cat-"]').forEach(btn => {
      if (btn.id === `cat-${catId}`) {
        btn.className = btn.className.replace(/bg-surface-container-low border border-outline-variant\/10 text-on-surface-variant/, 'bg-primary text-on-primary');
      } else {
        btn.className = btn.className.replace(/bg-primary text-on-primary/, 'bg-surface-container-low border border-outline-variant/10 text-on-surface-variant');
      }
    });
    // Filter recipe cards
    document.querySelectorAll('.recipe-card').forEach(card => {
      card.style.display = (catId === 'all' || card.dataset.category === catId) ? '' : 'none';
    });
  };

  window._generateRecipe = () => {
    const input = document.getElementById('ingredientInput');
    const result = document.getElementById('aiRecipeResult');
    if (!input || !result) return;
    const ingredients = input.value.trim();
    if (!ingredients) { input.focus(); return; }
    result.classList.remove('hidden');
    result.innerHTML = `<div class="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-on-surface-variant">
      <span class="material-symbols-outlined text-primary text-sm animate-pulse mr-1">auto_awesome</span>
      AI recipe generation from ingredients is a Premium feature. Upgrade to unlock!
    </div>`;
  };

  window._viewRecipe = (index) => {
    const recipe = SAMPLE_RECIPES[index];
    if (!recipe) return;
    const result = document.getElementById('aiRecipeResult');
    if (!result) return;
    result.classList.remove('hidden');
    result.innerHTML = `<div class="p-3 rounded-lg bg-surface-container-low border border-outline-variant/10">
      <p class="text-sm font-bold text-on-surface mb-1">${recipe.name}</p>
      <div class="flex gap-3 text-[10px] text-on-surface-variant">
        <span>${recipe.time}</span><span>${recipe.cal} kcal</span><span>P: ${recipe.protein}g</span><span>${recipe.difficulty}</span>
      </div>
      <p class="text-xs text-on-surface-variant mt-2">Full recipe details available with Premium. This is a sample preview.</p>
    </div>`;
  };
}

export async function renderRecipe() {
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const dietType = profile.diet_type || 'balanced';

  setTimeout(setupRecipeHandlers, 50);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'AI Recipes', subtitle: 'Personalized to your goals', showBack: true })}

      <div class="px-5 py-5 space-y-5">
        <!-- Search Bar -->
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          <input type="text" id="recipeSearch" placeholder="Search recipes, ingredients..." 
                 class="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none"
                 oninput="window._filterRecipes && window._filterRecipes(this.value)">
        </div>

        <!-- Diet Badge -->
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold capitalize">${dietType} Diet</span>
          ${profile.restrictions?.length > 0 ? profile.restrictions.map(r => 
            `<span class="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs">${r}</span>`
          ).join('') : ''}
        </div>

        <!-- Categories -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Categories</h3>
          <div class="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
            <button onclick="window._filterCategory && window._filterCategory('all')" 
                    class="flex-shrink-0 px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold" id="cat-all">All</button>
            ${RECIPE_CATEGORIES.map(cat => `
              <button onclick="window._filterCategory && window._filterCategory('${cat.id}')"
                      class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/10 text-on-surface-variant text-xs hover:border-primary/30 hover:text-primary transition-all" id="cat-${cat.id}">
                <span class="material-symbols-outlined text-sm">${cat.icon}</span>
                ${cat.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- AI Generate Section -->
        <div class="p-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
            </div>
            <div>
              <p class="text-sm font-bold text-on-surface">AI Recipe Generator</p>
              <p class="text-[10px] text-on-surface-variant">Tell me what you have, I'll create a recipe</p>
            </div>
          </div>
          <div class="flex gap-2">
            <input type="text" id="ingredientInput" placeholder="e.g. chicken, rice, broccoli..."
                   class="flex-1 px-3 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
            <button onclick="window._generateRecipe && window._generateRecipe()" 
                    class="px-4 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-sm font-bold hover:bg-primary transition-colors">
              Generate
            </button>
          </div>
          <div id="aiRecipeResult" class="mt-3 hidden"></div>
        </div>

        <!-- Recipe Grid -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Recommended For You</h3>
          <div id="recipeGrid" class="space-y-3">
            ${SAMPLE_RECIPES.map((recipe, i) => `
              <div class="recipe-card flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer"
                   data-category="${recipe.category}" onclick="window._viewRecipe && window._viewRecipe(${i})">
                <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-primary text-2xl" style="font-variation-settings: 'FILL' 1;">${recipe.image}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-on-surface truncate">${recipe.name}</p>
                  <div class="flex items-center gap-3 mt-1">
                    <span class="text-[10px] text-on-surface-variant flex items-center gap-0.5">
                      <span class="material-symbols-outlined text-xs">schedule</span> ${recipe.time}
                    </span>
                    <span class="text-[10px] text-on-surface-variant flex items-center gap-0.5">
                      <span class="material-symbols-outlined text-xs">local_fire_department</span> ${recipe.cal} kcal
                    </span>
                    <span class="text-[10px] text-primary font-semibold">P: ${recipe.protein}g</span>
                  </div>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

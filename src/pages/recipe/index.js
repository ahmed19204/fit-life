/**
 * FitLife AI Recipe Generator
 * Real AI-powered recipe generation from ingredients.
 * Uses generateRecipeFromIngredients() via centralized AI manager.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile, generateRecipeFromIngredients } from '../../services/ai.js';

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

let isGenerating = false;

function setupRecipeHandlers(profile) {
  let activeCategory = 'all';

  window._filterRecipes = (query) => {
    const q = query.toLowerCase();
    document.querySelectorAll('.recipe-card').forEach(card => {
      const name = card.querySelector('.recipe-name')?.textContent?.toLowerCase() || '';
      card.style.display = name.includes(q) ? '' : 'none';
    });
  };

  window._filterCategory = (catId) => {
    activeCategory = catId;
    document.querySelectorAll('[id^="cat-"]').forEach(btn => {
      const isActive = btn.id === `cat-${catId}`;
      btn.classList.toggle('bg-primary', isActive);
      btn.classList.toggle('text-on-primary', isActive);
      btn.classList.toggle('bg-surface-container-low', !isActive);
      btn.classList.toggle('text-on-surface-variant', !isActive);
    });
    document.querySelectorAll('.recipe-card').forEach(card => {
      card.style.display = (catId === 'all' || card.dataset.category === catId) ? '' : 'none';
    });
  };

  // Real AI recipe generation
  window._generateRecipe = async () => {
    const input = document.getElementById('ingredientInput');
    const result = document.getElementById('aiRecipeResult');
    if (!input || !result) return;
    const ingredients = input.value.trim();
    if (!ingredients) { input.focus(); return; }
    if (isGenerating) return;
    isGenerating = true;

    const btn = document.getElementById('generateRecipeBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">progress_activity</span>'; }

    result.classList.remove('hidden');
    result.innerHTML = `
      <div class="p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
        <div class="flex justify-center gap-1.5 mb-2">
          <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 0ms;"></div>
          <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 150ms;"></div>
          <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 300ms;"></div>
        </div>
        <p class="text-xs text-on-surface-variant">AI is creating your personalized recipe...</p>
      </div>`;

    const res = await generateRecipeFromIngredients(ingredients, profile);
    isGenerating = false;
    if (btn) { btn.disabled = false; btn.innerHTML = 'Generate'; }

    if (res.success && res.data) {
      const r = res.data;
      result.innerHTML = `
        <div class="p-4 rounded-xl bg-surface-container-low border border-primary/20 space-y-3">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-primary text-2xl" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
            </div>
            <div>
              <h4 class="text-sm font-bold text-on-surface">${r.name || 'AI Recipe'}</h4>
              <div class="flex gap-3 mt-1 text-[10px] text-on-surface-variant">
                ${r.prepTime ? `<span>Prep: ${r.prepTime}</span>` : ''}
                ${r.cookTime ? `<span>Cook: ${r.cookTime}</span>` : ''}
                ${r.servings ? `<span>${r.servings} servings</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Nutrition -->
          <div class="grid grid-cols-4 gap-2">
            ${[
              { label: 'Cal', value: r.calories || 0, color: 'primary' },
              { label: 'Protein', value: `${r.protein || 0}g`, color: 'primary' },
              { label: 'Carbs', value: `${r.carbs || 0}g`, color: 'secondary' },
              { label: 'Fat', value: `${r.fat || 0}g`, color: 'tertiary' },
            ].map(n => `
              <div class="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/10 text-center">
                <p class="text-sm font-bold text-${n.color}">${n.value}</p>
                <p class="text-[9px] text-on-surface-variant">${n.label}</p>
              </div>
            `).join('')}
          </div>

          <!-- Ingredients -->
          ${(r.ingredients || []).length > 0 ? `
            <div>
              <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Ingredients</p>
              <ul class="space-y-1">
                ${r.ingredients.map(i => `
                  <li class="text-xs text-on-surface flex items-start gap-2">
                    <span class="material-symbols-outlined text-primary text-sm mt-0.5" style="font-variation-settings: 'FILL' 1;">check_circle</span>
                    ${i}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <!-- Instructions -->
          ${(r.instructions || []).length > 0 ? `
            <div>
              <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Instructions</p>
              <ol class="space-y-2">
                ${r.instructions.map((step, idx) => `
                  <li class="text-xs text-on-surface flex items-start gap-2">
                    <span class="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">${idx + 1}</span>
                    <span>${step}</span>
                  </li>
                `).join('')}
              </ol>
            </div>
          ` : ''}

          ${r.tips ? `
            <div class="p-3 rounded-lg bg-secondary/5 border border-secondary/10">
              <p class="text-xs text-on-surface-variant"><span class="font-semibold text-secondary">Tip:</span> ${r.tips}</p>
            </div>
          ` : ''}
        </div>`;
    } else {
      result.innerHTML = `
        <div class="p-3 rounded-lg bg-error/5 border border-error/10 text-center">
          <span class="material-symbols-outlined text-error text-lg mb-1 block">error</span>
          <p class="text-xs text-on-surface-variant">${res.message || 'Failed to generate recipe. Please try again.'}</p>
          <button onclick="window._generateRecipe()" class="mt-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Retry</button>
        </div>`;
    }
  };

  window._viewRecipe = (index) => {
    const recipe = SAMPLE_RECIPES[index];
    if (!recipe) return;
    const result = document.getElementById('aiRecipeResult');
    if (!result) return;
    result.classList.remove('hidden');
    result.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/10">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings: 'FILL' 1;">${recipe.image}</span>
          </div>
          <div>
            <p class="text-sm font-bold text-on-surface">${recipe.name}</p>
            <div class="flex gap-3 text-[10px] text-on-surface-variant">
              <span>${recipe.time}</span><span>${recipe.cal} kcal</span><span>P: ${recipe.protein}g</span>
            </div>
          </div>
        </div>
        <p class="text-xs text-on-surface-variant">This is a curated sample recipe. Use the AI generator above with your own ingredients for personalized recipes!</p>
      </div>`;
  };
}

export async function renderRecipe() {
  const profileRes = await getNutritionProfile();
  const profile = profileRes.data?.profile || {};
  const dietType = profile.diet_type || 'balanced';
  isGenerating = false;

  setTimeout(() => setupRecipeHandlers(profile), 50);

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
          ${(profile.restrictions || []).length > 0 ? profile.restrictions.map(r => 
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
                      class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container-low text-on-surface-variant text-xs hover:border-primary/30 hover:text-primary transition-all" id="cat-${cat.id}">
                <span class="material-symbols-outlined text-sm">${cat.icon}</span>
                ${cat.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- AI Generate Section -->
        <div class="p-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
          <div class="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.06]" style="background: radial-gradient(circle, #22c55e, transparent);"></div>
          <div class="relative z-10">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
              </div>
              <div>
                <p class="text-sm font-bold text-on-surface">AI Recipe Generator</p>
                <p class="text-[10px] text-on-surface-variant">Tell me what you have, AI creates a recipe</p>
              </div>
            </div>
            <div class="flex gap-2">
              <input type="text" id="ingredientInput" placeholder="e.g. chicken, rice, broccoli, garlic..."
                     class="flex-1 px-3 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none"
                     onkeydown="if(event.key==='Enter') window._generateRecipe && window._generateRecipe()">
              <button id="generateRecipeBtn" onclick="window._generateRecipe && window._generateRecipe()" 
                      class="px-5 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.97]">
                Generate
              </button>
            </div>
          </div>
          <div id="aiRecipeResult" class="mt-3 hidden relative z-10"></div>
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
                  <p class="recipe-name text-sm font-bold text-on-surface truncate">${recipe.name}</p>
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

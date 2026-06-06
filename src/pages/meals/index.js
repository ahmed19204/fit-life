/**
 * FitLife Meal Analysis / AI Food Vision Logging
 * Scan meals with AI vision or manual entry.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { saveMeal } from '../../services/meals.js';

export function renderMeals() {
  setTimeout(() => initMealsPage(), 50);
  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Log Meal', subtitle: 'AI-powered food analysis', showBack: true })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- AI Vision Card -->
        <div class="p-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-surface-container-low to-surface-container relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.06]" style="background: radial-gradient(circle, #22c55e, transparent);"></div>
          <div class="relative z-10 text-center">
            <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
              <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">photo_camera</span>
            </div>
            <h3 class="text-lg font-bold mb-1">AI Food Scanner</h3>
            <p class="text-xs text-on-surface-variant mb-4">Snap a photo and AI analyzes nutrition instantly</p>
            <label class="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all">
              <span class="material-symbols-outlined text-lg">add_a_photo</span>
              Take Photo
              <input type="file" accept="image/*" capture="environment" class="hidden" onchange="handlePhotoCapture(event)">
            </label>
          </div>
        </div>

        <!-- Manual Entry -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Quick Add</h3>
          <form id="manualMealForm" onsubmit="handleManualMeal(event)" class="space-y-3">
            <input id="mealName" type="text" required placeholder="Meal name (e.g., Grilled Chicken Salad)"
                   class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
            <div class="grid grid-cols-2 gap-3">
              <select id="mealType" class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Snack">Snack</option>
              </select>
              <input id="mealCalories" type="number" min="0" placeholder="Calories" required
                     class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
            </div>
            <div class="grid grid-cols-3 gap-3">
              <input id="mealProtein" type="number" min="0" placeholder="Protein (g)"
                     class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              <input id="mealCarbs" type="number" min="0" placeholder="Carbs (g)"
                     class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              <input id="mealFat" type="number" min="0" placeholder="Fat (g)"
                     class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
            </div>
            <button type="submit" id="saveMealBtn"
                    class="w-full py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-lg">add</span> Save Meal
            </button>
          </form>
        </div>

        <!-- AI Result Area -->
        <div id="aiResultArea" class="hidden">
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">AI Analysis Result</h3>
          <div id="aiResult" class="p-4 rounded-xl border border-primary/20 bg-surface-container-low/50"></div>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

function initMealsPage() {
  window.handleManualMeal = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveMealBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Saving...';
    
    const result = await saveMeal({
      name: document.getElementById('mealName').value,
      type: document.getElementById('mealType').value,
      calories: parseInt(document.getElementById('mealCalories').value) || 0,
      protein: parseInt(document.getElementById('mealProtein').value) || 0,
      carbs: parseInt(document.getElementById('mealCarbs').value) || 0,
      fat: parseInt(document.getElementById('mealFat').value) || 0,
    });

    if (result.success) {
      document.getElementById('manualMealForm').reset();
      btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">check_circle</span> Saved!';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">add</span> Save Meal';
      }, 1500);
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-lg">add</span> Save Meal';
      alert(result.message);
    }
  };

  window.handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // For now show placeholder - full AI vision integration coming in later phase
    const area = document.getElementById('aiResultArea');
    const result = document.getElementById('aiResult');
    area.classList.remove('hidden');
    result.innerHTML = `
      <div class="text-center py-4">
        <span class="material-symbols-outlined text-primary text-3xl mb-2 block animate-pulse">neurology</span>
        <p class="text-sm text-on-surface">AI Vision analysis coming soon!</p>
        <p class="text-xs text-on-surface-variant mt-1">Photo captured: ${file.name}</p>
      </div>`;
  };
}

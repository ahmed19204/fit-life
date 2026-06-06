/**
 * FitLife Meal Analysis — AI Food Scanner + Text Analyzer + Manual Entry
 * Features:
 * - Camera capture (mobile) + Gallery upload (all devices)
 * - Image preview with compression
 * - AI image analysis via Gemini Vision
 * - Text-based meal description analysis
 * - Manual entry with quick-add
 * - Auto-save to database + dashboard sync
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { saveMeal, saveAnalysisHistory } from '../../services/meals.js';
import { analyzeImageMeal, analyzeTextMeal } from '../../services/ai.js';
import { toast } from '../../services/toast.js';
import { withLoading } from '../../services/loading.js';

let isAnalyzing = false;

// Image compression utility
function compressImage(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMealTypeEmoji(type) {
  return { 'Breakfast': 'egg_alt', 'Lunch': 'lunch_dining', 'Dinner': 'dinner_dining', 'Snack': 'cookie' }[type] || 'restaurant';
}

export function renderMeals() {
  isAnalyzing = false;
  setTimeout(() => initMealsPage(), 50);
  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Analyze Food', subtitle: 'AI-powered nutrition analysis', showBack: true })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- Mode Tabs -->
        <div class="flex gap-2 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
          <button id="tabCamera" onclick="window._switchTab('camera')" class="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all bg-primary text-on-primary flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">photo_camera</span> Scan
          </button>
          <button id="tabText" onclick="window._switchTab('text')" class="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm">edit_note</span> Describe
          </button>
          <button id="tabManual" onclick="window._switchTab('manual')" class="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm">add_circle</span> Manual
          </button>
        </div>

        <!-- ===== CAMERA / IMAGE TAB ===== -->
        <div id="panelCamera">
          <div class="p-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-surface-container-low to-surface-container relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.06]" style="background: radial-gradient(circle, #22c55e, transparent);"></div>
            
            <!-- Image Preview (hidden initially) -->
            <div id="imagePreviewArea" class="hidden mb-4">
              <div class="relative rounded-xl overflow-hidden border border-outline-variant/20">
                <img id="imagePreview" class="w-full max-h-64 object-cover" alt="Food preview">
                <button onclick="window._clearImage()" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-surface/80 backdrop-blur flex items-center justify-center text-on-surface hover:bg-error/20 hover:text-error transition-all">
                  <span class="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            <!-- Upload Options (shown initially) -->
            <div id="uploadArea" class="relative z-10 text-center">
              <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">photo_camera</span>
              </div>
              <h3 class="text-lg font-bold mb-1">AI Food Scanner</h3>
              <p class="text-xs text-on-surface-variant mb-4">Take a photo or upload from gallery — AI analyzes nutrition instantly</p>
              <div class="flex gap-3 justify-center">
                <label class="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.97]">
                  <span class="material-symbols-outlined text-lg">photo_camera</span> Camera
                  <input type="file" accept="image/*" capture="environment" class="hidden" onchange="window._handleImage(event)">
                </label>
                <label class="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-primary/30 text-primary font-bold text-sm cursor-pointer hover:bg-primary/10 transition-all active:scale-[0.97]">
                  <span class="material-symbols-outlined text-lg">photo_library</span> Gallery
                  <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" onchange="window._handleImage(event)">
                </label>
              </div>
            </div>

            <!-- Analyze Button (shown after image selected) -->
            <button id="analyzeImageBtn" onclick="window._analyzeImage()" class="hidden w-full mt-4 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">neurology</span> Analyze with AI
            </button>
          </div>
        </div>

        <!-- ===== TEXT DESCRIPTION TAB ===== -->
        <div id="panelText" class="hidden">
          <div class="p-5 rounded-2xl border border-secondary/20 bg-gradient-to-br from-surface-container-low to-surface-container relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style="background: radial-gradient(circle, #9ddf2e, transparent);"></div>
            <div class="relative z-10">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
                  <span class="material-symbols-outlined text-secondary text-2xl" style="font-variation-settings: 'FILL' 1;">edit_note</span>
                </div>
                <div>
                  <h3 class="text-base font-bold">Describe Your Meal</h3>
                  <p class="text-[10px] text-on-surface-variant">AI will estimate calories & macros</p>
                </div>
              </div>
              <textarea id="mealDescription" rows="3" placeholder="e.g. I ate a 180g beef burger with cheddar cheese, lettuce, tomato, ketchup, and a side of fries..."
                        class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-secondary focus:ring-1 focus:ring-secondary/30 outline-none resize-none"></textarea>
              <button id="analyzeTextBtn" onclick="window._analyzeText()" class="w-full mt-3 py-3 rounded-full bg-secondary text-on-secondary font-bold text-sm hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">neurology</span> Analyze Meal
              </button>
            </div>
          </div>
        </div>

        <!-- ===== MANUAL ENTRY TAB ===== -->
        <div id="panelManual" class="hidden">
          <div class="p-5 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
            <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Quick Add</h3>
            <form id="manualMealForm" onsubmit="window._handleManualMeal(event)" class="space-y-3">
              <input id="mealName" type="text" required placeholder="Meal name (e.g., Grilled Chicken Salad)"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
              <div class="grid grid-cols-2 gap-3">
                <select id="mealType" class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch" selected>Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snack">Snack</option>
                </select>
                <input id="mealCalories" type="number" min="0" max="5000" placeholder="Calories" required
                       class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <div class="grid grid-cols-3 gap-3">
                <input id="mealProtein" type="number" min="0" max="500" placeholder="Protein (g)"
                       class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                <input id="mealCarbs" type="number" min="0" max="500" placeholder="Carbs (g)"
                       class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                <input id="mealFat" type="number" min="0" max="500" placeholder="Fat (g)"
                       class="px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <button type="submit" id="saveMealBtn"
                      class="w-full py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-lg">add</span> Save Meal
              </button>
            </form>
          </div>
        </div>

        <!-- ===== AI RESULT AREA ===== -->
        <div id="aiResultArea" class="hidden animate-fade-in">
          <div id="aiResult" class="p-5 rounded-2xl border border-primary/20 bg-surface-container-low/50"></div>
        </div>

        <!-- ===== TOAST ===== -->
        <div id="mealToast" class="fixed bottom-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/30 opacity-0 pointer-events-none transition-all duration-300 z-50 flex items-center gap-2" style="transform: translateX(-50%) translateY(10px);">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">check_circle</span>
          <span id="toastText">Meal saved!</span>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

function showToast(text, duration = 2500, type = 'success') {
  // Use the unified, app-wide toast system (Phase 3)
  try {
    if (type === 'error') return toast.error(text, { duration });
    return toast.success(text, { duration });
  } catch {
    // Fallback to legacy DOM toast if container missing
    const el = document.getElementById('mealToast');
    const txt = document.getElementById('toastText');
    if (!el || !txt) return;
    txt.textContent = text;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(10px)'; }, duration);
  }
}

function renderAnalysisResult(data, imageDataUrl) {
  const area = document.getElementById('aiResultArea');
  const result = document.getElementById('aiResult');
  if (!area || !result) return;

  area.classList.remove('hidden');
  result.innerHTML = `
    <div class="space-y-4">
      <!-- Success Header -->
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings: 'FILL' 1;">check_circle</span>
        </div>
        <div>
          <h3 class="text-base font-bold text-on-surface">${data.name || 'Analyzed Meal'}</h3>
          <p class="text-[10px] text-on-surface-variant">${data.summary || 'AI nutrition analysis complete'}</p>
        </div>
      </div>

      ${imageDataUrl ? `
        <div class="rounded-xl overflow-hidden border border-outline-variant/10">
          <img src="${imageDataUrl}" class="w-full max-h-48 object-cover" alt="Analyzed food">
        </div>
      ` : ''}

      <!-- Nutrition Card -->
      <div class="grid grid-cols-4 gap-2">
        ${[
          { label: 'Calories', value: data.calories || 0, unit: 'kcal', color: 'primary' },
          { label: 'Protein', value: data.protein || 0, unit: 'g', color: 'primary' },
          { label: 'Carbs', value: data.carbs || 0, unit: 'g', color: 'secondary' },
          { label: 'Fat', value: data.fat || 0, unit: 'g', color: 'tertiary' },
        ].map(n => `
          <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/10 text-center">
            <p class="text-lg font-bold text-${n.color}">${n.value}</p>
            <p class="text-[9px] text-on-surface-variant">${n.unit} ${n.label}</p>
          </div>
        `).join('')}
      </div>

      <!-- Foods List -->
      ${(data.foods || []).length > 0 ? `
        <div>
          <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Detected Foods</p>
          <div class="flex flex-wrap gap-1.5">
            ${data.foods.map(f => `<span class="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">${f}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${data.servingSize ? `
        <p class="text-xs text-on-surface-variant"><span class="font-semibold">Serving:</span> ${data.servingSize}</p>
      ` : ''}

      <!-- Save Buttons -->
      <div class="flex gap-3">
        <button id="saveAnalyzedBtn" onclick="window._saveAnalyzedMeal()" class="flex-1 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">save</span> Save to Log
        </button>
        <button onclick="window._retryAnalysis()" class="px-4 py-3 rounded-full border border-outline-variant/20 text-on-surface-variant text-sm font-medium hover:border-primary/30 hover:text-primary transition-all">
          <span class="material-symbols-outlined text-lg">refresh</span>
        </button>
      </div>
    </div>`;

  // Scroll to result
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showAnalyzing(mode) {
  const area = document.getElementById('aiResultArea');
  const result = document.getElementById('aiResult');
  if (!area || !result) return;
  area.classList.remove('hidden');
  result.innerHTML = `
    <div class="text-center py-8">
      <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20 relative">
        <span class="material-symbols-outlined text-primary text-3xl animate-pulse" style="font-variation-settings: 'FILL' 1;">neurology</span>
        <div class="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-ping"></div>
      </div>
      <h3 class="text-base font-bold text-on-surface mb-1">Analyzing ${mode === 'image' ? 'Image' : 'Meal'}...</h3>
      <p class="text-xs text-on-surface-variant">AI is identifying foods and estimating nutrition</p>
      <div class="flex justify-center gap-1.5 mt-4">
        <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 0ms;"></div>
        <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 150ms;"></div>
        <div class="w-2 h-2 rounded-full bg-primary animate-bounce" style="animation-delay: 300ms;"></div>
      </div>
    </div>`;
}

function showError(message) {
  const area = document.getElementById('aiResultArea');
  const result = document.getElementById('aiResult');
  if (!area || !result) return;
  area.classList.remove('hidden');
  result.innerHTML = `
    <div class="text-center py-6">
      <span class="material-symbols-outlined text-error text-3xl mb-2 block">error</span>
      <p class="text-sm text-on-surface font-medium mb-1">Analysis Failed</p>
      <p class="text-xs text-on-surface-variant mb-4">${message}</p>
      <button onclick="window._retryAnalysis()" class="px-5 py-2.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
        Try Again
      </button>
    </div>`;
}

function initMealsPage() {
  let currentImageData = null;
  let lastAnalysisResult = null;
  let lastMode = 'camera';

  // Tab switching
  window._switchTab = (tab) => {
    const tabs = { camera: 'panelCamera', text: 'panelText', manual: 'panelManual' };
    const btns = { camera: 'tabCamera', text: 'tabText', manual: 'tabManual' };
    Object.entries(tabs).forEach(([k, id]) => {
      const el = document.getElementById(id);
      const btn = document.getElementById(btns[k]);
      if (el) el.classList.toggle('hidden', k !== tab);
      if (btn) {
        if (k === tab) {
          btn.className = btn.className.replace(/text-on-surface-variant hover:text-on-surface/, 'bg-primary text-on-primary');
          if (!btn.classList.contains('bg-primary')) btn.classList.add('bg-primary', 'text-on-primary');
          btn.classList.remove('text-on-surface-variant');
        } else {
          btn.className = btn.className.replace(/bg-primary text-on-primary/, 'text-on-surface-variant hover:text-on-surface');
          btn.classList.remove('bg-primary', 'text-on-primary');
          btn.classList.add('text-on-surface-variant');
        }
      }
    });
    // Hide result area when switching tabs
    const resultArea = document.getElementById('aiResultArea');
    if (resultArea) resultArea.classList.add('hidden');
    lastMode = tab;
  };

  // Image handling
  window._handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    try {
      const compressed = await compressImage(file, 1024, 0.8);
      currentImageData = compressed;
      
      const preview = document.getElementById('imagePreview');
      const previewArea = document.getElementById('imagePreviewArea');
      const uploadArea = document.getElementById('uploadArea');
      const analyzeBtn = document.getElementById('analyzeImageBtn');
      
      if (preview) preview.src = compressed;
      if (previewArea) previewArea.classList.remove('hidden');
      if (uploadArea) uploadArea.classList.add('hidden');
      if (analyzeBtn) { analyzeBtn.classList.remove('hidden'); analyzeBtn.style.display = 'flex'; }
    } catch (err) {
      console.error('Image compression failed:', err);
      showError('Failed to process image. Try another photo.');
    }
    // Reset file input
    e.target.value = '';
  };

  window._clearImage = () => {
    currentImageData = null;
    const previewArea = document.getElementById('imagePreviewArea');
    const uploadArea = document.getElementById('uploadArea');
    const analyzeBtn = document.getElementById('analyzeImageBtn');
    if (previewArea) previewArea.classList.add('hidden');
    if (uploadArea) uploadArea.classList.remove('hidden');
    if (analyzeBtn) { analyzeBtn.classList.add('hidden'); analyzeBtn.style.display = 'none'; }
    const resultArea = document.getElementById('aiResultArea');
    if (resultArea) resultArea.classList.add('hidden');
  };

  // Analyze image
  window._analyzeImage = async () => {
    if (isAnalyzing || !currentImageData) return;
    isAnalyzing = true;
    lastMode = 'camera';

    const btn = document.getElementById('analyzeImageBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Analyzing...'; }

    showAnalyzing('image');

    const result = await withLoading('meal-analyze-image', () => analyzeImageMeal(currentImageData));
    isAnalyzing = false;

    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">neurology</span> Analyze with AI'; }

    if (result.success) {
      lastAnalysisResult = result.data;
      renderAnalysisResult(result.data, currentImageData);
    } else {
      showError(result.message || 'Analysis failed. Please try again.');
    }
  };

  // Analyze text
  window._analyzeText = async () => {
    const textarea = document.getElementById('mealDescription');
    const desc = textarea?.value?.trim();
    if (!desc || desc.length < 3) { textarea?.focus(); return; }
    if (isAnalyzing) return;
    isAnalyzing = true;
    lastMode = 'text';

    const btn = document.getElementById('analyzeTextBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Analyzing...'; }

    showAnalyzing('text');

    const result = await withLoading('meal-analyze-text', () => analyzeTextMeal(desc));
    isAnalyzing = false;

    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">neurology</span> Analyze Meal'; }

    if (result.success) {
      lastAnalysisResult = result.data;
      renderAnalysisResult(result.data, null);
    } else {
      showError(result.message || 'Analysis failed. Please try again.');
    }
  };

  // Save analyzed meal
  window._saveAnalyzedMeal = async () => {
    if (!lastAnalysisResult) return;
    const btn = document.getElementById('saveAnalyzedBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Saving...'; }

    const meal = {
      name: lastAnalysisResult.name || 'AI Analyzed Meal',
      type: lastAnalysisResult.mealType || 'Meal',
      calories: lastAnalysisResult.calories || 0,
      protein: lastAnalysisResult.protein || 0,
      carbs: lastAnalysisResult.carbs || 0,
      fat: lastAnalysisResult.fat || 0,
      aiSuggested: true,
      food_emoji: (lastAnalysisResult.foods || [])[0] || null,
    };

    const result = await saveMeal(meal);
    if (result.success) {
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">check_circle</span> Saved!';
      showToast('Meal saved! Dashboard updated.');
      // Save analysis history for tracking
      saveAnalysisHistory({ input_type: lastMode === 'camera' ? 'image' : 'description', result: lastAnalysisResult, meal_id: result.data?.meal?.id }).catch(() => {});
      lastAnalysisResult = null;
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">save</span> Save to Log'; }
      }, 2000);
    } else {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg" style="font-variation-settings: \'FILL\' 1;">save</span> Save to Log'; }
      showError(result.message || 'Failed to save meal.');
    }
  };

  // Retry
  window._retryAnalysis = () => {
    const resultArea = document.getElementById('aiResultArea');
    if (resultArea) resultArea.classList.add('hidden');
    if (lastMode === 'camera' && currentImageData) {
      window._analyzeImage();
    }
  };

  // Manual entry
  window._handleManualMeal = async (e) => {
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
      showToast('Meal saved successfully!');
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">add</span> Save Meal';
      }, 1500);
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-lg">add</span> Save Meal';
      showError(result.message || 'Failed to save meal.');
    }
  };
}

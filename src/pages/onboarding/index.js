/**
 * FitLife AI Onboarding Flow
 * Multi-step onboarding with premium UI, data collection for AI plan generation.
 * Preserved onboarding logic from original FitLife project.
 */
import { generateOnboardingPlan, saveNutritionProfile, resetOnboardingLock, invalidateProfileCache } from '../../services/ai.js';
import { navigate } from '../../services/router.js';
import { toast } from '../../services/toast.js';
import { withLoading } from '../../services/loading.js';

let currentStep = 1;
const totalSteps = 5;
let onboardingData = {};

let isGenerating = false; // Lock to prevent duplicate plan generation

export function renderOnboarding() {
  currentStep = 1;
  onboardingData = {};
  isGenerating = false;
  // Clear the one-shot lock so a fresh onboarding can generate a new plan
  resetOnboardingLock();
  setTimeout(() => initOnboarding(), 50);
  return buildStepHTML();
}

function buildStepHTML() {
  return `
    <div class="min-h-screen bg-surface text-on-surface flex flex-col pl-safe pr-safe pt-safe pb-safe">
      <!-- Header -->
      <header class="px-5 pt-3 pb-3 flex items-center justify-between">
        <button onclick="onboardingBack()" class="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-high/50 text-on-surface hover:bg-surface-container-highest transition-colors">
          <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div class="flex-1 mx-4">
          <div class="flex items-center gap-1.5">
            ${Array.from({length: totalSteps}, (_, i) => `
              <div class="flex-1 h-1 rounded-full transition-all duration-500 ${i < currentStep ? 'bg-primary' : 'bg-surface-container-highest'}"></div>
            `).join('')}
          </div>
          <p class="text-[10px] text-on-surface-variant text-center mt-1.5">Step ${currentStep} of ${totalSteps}</p>
        </div>
        <div class="w-9"></div>
      </header>

      <!-- Step Content -->
      <div id="stepContent" class="flex-1 px-5 py-4 overflow-y-auto pb-32">
        ${getStepContent(currentStep)}
      </div>

      <!-- Bottom Action -->
      <div class="fixed bottom-0 left-0 right-0 px-5 pl-safe pr-safe pb-safe py-4 border-t border-outline-variant/10"
           style="background: rgba(14, 21, 14, 0.95); backdrop-filter: blur(16px);">
        <button id="nextStepBtn" onclick="onboardingNext()"
                class="w-full py-3.5 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
          ${currentStep < totalSteps ? 'Continue' : 'Generate My AI Plan'}
          <span class="material-symbols-outlined text-lg">${currentStep < totalSteps ? 'arrow_forward' : 'auto_awesome'}</span>
        </button>
      </div>
    </div>`;
}

function getStepContent(step) {
  switch(step) {
    case 1: return stepPersonal();
    case 2: return stepDietary();
    case 3: return stepActivity();
    case 4: return stepHealth();
    case 5: return stepReview();
    default: return '';
  }
}

function stepPersonal() {
  return `
    <div class="animate-fade-in">
      <div class="mb-6">
        <span class="material-symbols-outlined text-primary text-3xl mb-3 block" style="font-variation-settings: 'FILL' 1;">person</span>
        <h2 class="text-2xl font-bold mb-2">Personal Information</h2>
        <p class="text-sm text-on-surface-variant">Help us understand your body to create the perfect plan.</p>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Gender</label>
          <div class="grid grid-cols-2 gap-3">
            ${['male', 'female'].map(g => `
              <button type="button" onclick="selectOption('gender', '${g}', this)"
                      class="ob-option py-3 rounded-xl border border-outline-variant/20 text-sm font-medium text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all ${onboardingData.gender === g ? 'border-primary bg-primary/10 text-primary' : 'bg-surface-container-low'}">
                ${g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Age</label>
          <input id="obAge" type="number" min="10" max="120" value="${onboardingData.age || ''}" oninput="onboardingData.age=this.value"
                 class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none text-sm" placeholder="25">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Weight (kg)</label>
            <input id="obWeight" type="number" min="20" max="300" step="0.1" value="${onboardingData.weight || ''}" oninput="onboardingData.weight=this.value"
                   class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none text-sm" placeholder="70">
          </div>
          <div>
            <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Height (cm)</label>
            <input id="obHeight" type="number" min="80" max="250" step="0.1" value="${onboardingData.height || ''}" oninput="onboardingData.height=this.value"
                   class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none text-sm" placeholder="175">
          </div>
        </div>
      </div>
    </div>`;
}

function stepDietary() {
  const diets = [
    { id: 'balanced', label: 'Balanced', icon: 'restaurant' },
    { id: 'vegetarian', label: 'Vegetarian', icon: 'eco' },
    { id: 'vegan', label: 'Vegan', icon: 'grass' },
    { id: 'keto', label: 'Keto', icon: 'local_fire_department' },
    { id: 'paleo', label: 'Paleo', icon: 'pets' },
    { id: 'mediterranean', label: 'Mediterranean', icon: 'water_drop' },
    { id: 'high-protein', label: 'High Protein', icon: 'fitness_center' },
    { id: 'halal', label: 'Halal', icon: 'mosque' },
  ];
  return `
    <div class="animate-fade-in">
      <div class="mb-6">
        <span class="material-symbols-outlined text-primary text-3xl mb-3 block" style="font-variation-settings: 'FILL' 1;">restaurant_menu</span>
        <h2 class="text-2xl font-bold mb-2">Dietary Preferences</h2>
        <p class="text-sm text-on-surface-variant">What's your preferred eating style?</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${diets.map(d => `
          <button type="button" onclick="selectOption('diet_type', '${d.id}', this)"
                  class="ob-option flex items-center gap-3 p-4 rounded-xl border border-outline-variant/20 text-left hover:border-primary/50 transition-all ${onboardingData.diet_type === d.id ? 'border-primary bg-primary/10' : 'bg-surface-container-low'}">
            <span class="material-symbols-outlined text-lg ${onboardingData.diet_type === d.id ? 'text-primary' : 'text-on-surface-variant'}">${d.icon}</span>
            <span class="text-sm font-medium ${onboardingData.diet_type === d.id ? 'text-primary' : 'text-on-surface'}">${d.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="mt-5">
        <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Meals per Day</label>
        <div class="flex gap-2">
          ${[2,3,4,5].map(n => `
            <button type="button" onclick="selectOption('meals_per_day', ${n}, this)"
                    class="ob-option-meals flex-1 py-3 rounded-xl border border-outline-variant/20 text-sm font-bold transition-all ${onboardingData.meals_per_day == n ? 'border-primary bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant hover:border-primary/50'}">
              ${n}
            </button>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function stepActivity() {
  const levels = [
    { id: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise', icon: 'weekend' },
    { id: 'lightly-active', label: 'Light Active', desc: 'Exercise 1-3 days/week', icon: 'directions_walk' },
    { id: 'moderately-active', label: 'Moderately Active', desc: 'Exercise 3-5 days/week', icon: 'directions_run' },
    { id: 'very-active', label: 'Very Active', desc: 'Hard exercise 6-7 days/week', icon: 'local_fire_department' },
  ];
  return `
    <div class="animate-fade-in">
      <div class="mb-6">
        <span class="material-symbols-outlined text-primary text-3xl mb-3 block" style="font-variation-settings: 'FILL' 1;">directions_run</span>
        <h2 class="text-2xl font-bold mb-2">Activity Level</h2>
        <p class="text-sm text-on-surface-variant">How active is your lifestyle?</p>
      </div>
      <div class="space-y-3">
        ${levels.map(l => `
          <button type="button" onclick="selectOption('activity_level', '${l.id}', this)"
                  class="ob-option w-full flex items-center gap-4 p-4 rounded-xl border border-outline-variant/20 text-left hover:border-primary/50 transition-all ${onboardingData.activity_level === l.id ? 'border-primary bg-primary/10' : 'bg-surface-container-low'}">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center ${onboardingData.activity_level === l.id ? 'bg-primary/20' : 'bg-surface-container-high'}">
              <span class="material-symbols-outlined ${onboardingData.activity_level === l.id ? 'text-primary' : 'text-on-surface-variant'}">${l.icon}</span>
            </div>
            <div>
              <p class="text-sm font-bold ${onboardingData.activity_level === l.id ? 'text-primary' : 'text-on-surface'}">${l.label}</p>
              <p class="text-xs text-on-surface-variant">${l.desc}</p>
            </div>
          </button>
        `).join('')}
      </div>
    </div>`;
}

function stepHealth() {
  const goals = [
    { id: 'lose-weight', label: 'Lose Weight', icon: 'trending_down' },
    { id: 'build-muscle', label: 'Build Muscle', icon: 'fitness_center' },
    { id: 'improve-health', label: 'Improve Health', icon: 'favorite' },
    { id: 'maintain', label: 'Maintain', icon: 'balance' },
  ];
  const conditions = ['none', 'diabetes', 'hypertension', 'heart-disease', 'celiac', 'ibs', 'pcos', 'thyroid'];
  return `
    <div class="animate-fade-in">
      <div class="mb-6">
        <span class="material-symbols-outlined text-primary text-3xl mb-3 block" style="font-variation-settings: 'FILL' 1;">target</span>
        <h2 class="text-2xl font-bold mb-2">Goals & Health</h2>
        <p class="text-sm text-on-surface-variant">What are you working towards?</p>
      </div>
      <div class="mb-5">
        <label class="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">Primary Goal</label>
        <div class="grid grid-cols-2 gap-3">
          ${goals.map(g => `
            <button type="button" onclick="selectOption('goal', '${g.id}', this)"
                    class="ob-option flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/20 hover:border-primary/50 transition-all ${onboardingData.goal === g.id ? 'border-primary bg-primary/10' : 'bg-surface-container-low'}">
              <span class="material-symbols-outlined text-2xl ${onboardingData.goal === g.id ? 'text-primary' : 'text-on-surface-variant'}" style="font-variation-settings: 'FILL' 1;">${g.icon}</span>
              <span class="text-xs font-bold ${onboardingData.goal === g.id ? 'text-primary' : 'text-on-surface'}">${g.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">Health Conditions (optional)</label>
        <div class="flex flex-wrap gap-2">
          ${conditions.map(c => `
            <button type="button" onclick="toggleCondition('${c}', this)"
                    class="ob-condition px-3 py-1.5 rounded-full text-xs font-medium border border-outline-variant/20 transition-all ${(onboardingData.conditions || []).includes(c) ? 'border-primary bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant hover:border-primary/30'}">
              ${c === 'none' ? 'None' : c.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function stepReview() {
  const d = onboardingData;
  return `
    <div class="animate-fade-in">
      <div class="mb-6">
        <span class="material-symbols-outlined text-primary text-3xl mb-3 block" style="font-variation-settings: 'FILL' 1;">checklist</span>
        <h2 class="text-2xl font-bold mb-2">Review Your Profile</h2>
        <p class="text-sm text-on-surface-variant">Everything look good? Let's generate your plan!</p>
      </div>
      <div class="space-y-3">
        ${[
          { label: 'Gender', value: d.gender || 'Not set', icon: 'person' },
          { label: 'Age', value: d.age ? d.age + ' years' : 'Not set', icon: 'cake' },
          { label: 'Weight', value: d.weight ? d.weight + ' kg' : 'Not set', icon: 'monitor_weight' },
          { label: 'Height', value: d.height ? d.height + ' cm' : 'Not set', icon: 'height' },
          { label: 'Goal', value: d.goal?.replace(/-/g, ' ') || 'Not set', icon: 'target' },
          { label: 'Activity', value: d.activity_level?.replace(/-/g, ' ') || 'Not set', icon: 'directions_run' },
          { label: 'Diet', value: d.diet_type || 'Not set', icon: 'restaurant' },
          { label: 'Meals/day', value: d.meals_per_day || '3', icon: 'schedule' },
        ].map(item => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-primary text-lg">${item.icon}</span>
              <span class="text-sm text-on-surface-variant">${item.label}</span>
            </div>
            <span class="text-sm font-semibold text-on-surface capitalize">${item.value}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function initOnboarding() {
  window.onboardingData = onboardingData;

  window.selectOption = (key, value, el) => {
    onboardingData[key] = value;
    // Remove active state from siblings
    const parent = el.parentElement;
    const cls = key === 'meals_per_day' ? 'ob-option-meals' : 'ob-option';
    parent.querySelectorAll(`.${cls}`).forEach(btn => {
      btn.classList.remove('border-primary', 'bg-primary/10', 'text-primary');
      btn.classList.add('border-outline-variant/20');
    });
    el.classList.add('border-primary', 'bg-primary/10');
    el.classList.remove('border-outline-variant/20');
    // Update text colors in children
    el.querySelectorAll('.material-symbols-outlined').forEach(icon => icon.classList.add('text-primary'));
    el.querySelectorAll('span:not(.material-symbols-outlined), p:first-child').forEach(t => {
      if (t.classList.contains('text-on-surface') || t.classList.contains('text-on-surface-variant'))
        t.classList.add('text-primary');
    });
  };

  window.toggleCondition = (condition, el) => {
    if (!onboardingData.conditions) onboardingData.conditions = [];
    const idx = onboardingData.conditions.indexOf(condition);
    if (idx > -1) {
      onboardingData.conditions.splice(idx, 1);
      el.classList.remove('border-primary', 'bg-primary/10', 'text-primary');
      el.classList.add('border-outline-variant/20', 'text-on-surface-variant');
    } else {
      onboardingData.conditions.push(condition);
      el.classList.add('border-primary', 'bg-primary/10', 'text-primary');
      el.classList.remove('border-outline-variant/20', 'text-on-surface-variant');
    }
  };

  window.onboardingBack = () => {
    if (currentStep > 1) {
      currentStep--;
      updateStep();
    } else {
      navigate('/welcome');
    }
  };

  window.onboardingNext = async () => {
    if (currentStep < totalSteps) {
      // Collect input values from current step
      collectInputValues();
      currentStep++;
      updateStep();
    } else {
      // Prevent duplicate generation (double-click protection)
      if (isGenerating) return;
      isGenerating = true;
      
      // Generate plan
      collectInputValues();
      const btn = document.getElementById('nextStepBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Generating AI Plan...</span>';
      
      // Use one-shot AI request (runs AT MOST ONCE per session)
      const result = await withLoading('onboarding-plan', () => generateOnboardingPlan(onboardingData));
      if (result.success) {
        // Save the plan data for the plan page
        const planData = { ...onboardingData, ...result.data };
        sessionStorage.setItem('fitlife-plan', JSON.stringify(planData));
        
        // Save to database and invalidate caches
        await saveNutritionProfile(planData);
        invalidateProfileCache();
        
        navigate('/plan');
      } else {
        isGenerating = false;
        btn.disabled = false;
        btn.innerHTML = 'Generate My AI Plan <span class="material-symbols-outlined text-lg">auto_awesome</span>';
        toast.error('Failed to generate plan: ' + result.message);
      }
    }
  };
}

function collectInputValues() {
  const age = document.getElementById('obAge');
  const weight = document.getElementById('obWeight');
  const height = document.getElementById('obHeight');
  if (age) onboardingData.age = age.value;
  if (weight) onboardingData.weight = weight.value;
  if (height) onboardingData.height = height.value;
}

function updateStep() {
  const container = document.getElementById('stepContent');
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = buildStepHTML();
    initOnboarding();
  }
}

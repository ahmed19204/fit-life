/**
 * FitLife Profile & Settings
 * -----------------------------------------------------------------------------
 * - Safe-area aware layout
 * - Optimistic UI updates
 * - Deterministic nutrition targets
 * - Profile updates routed to both `profiles` and `user_profiles`
 */
import { getCurrentUser, getDisplayName, signOut } from '../../services/auth.js';
import { getNutritionProfile, updateProfileField } from '../../services/ai.js';
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { emit, EVENTS } from '../../services/events.js';
import { toast } from '../../services/toast.js';
import { withLoading } from '../../services/loading.js';

let isEditing = false;
let isSaving = false;
let currentProfile = {};
let currentUser = null;

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function labelForGoal(goal) {
  return {
    'build-muscle': 'Build Muscle',
    'lose-weight': 'Lose Weight',
    'improve-health': 'Improve Health',
    maintain: 'Maintain',
  }[goal] || '—';
}

function labelForActivity(activity) {
  return {
    sedentary: 'Sedentary',
    'lightly-active': 'Lightly Active',
    'moderately-active': 'Moderately Active',
    'very-active': 'Very Active',
  }[activity] || '—';
}

function labelForDiet(diet) {
  return {
    balanced: 'Balanced',
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    keto: 'Keto',
    paleo: 'Paleo',
    mediterranean: 'Mediterranean',
    'high-protein': 'High Protein',
    halal: 'Halal',
  }[diet] || (diet ? String(diet).replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : '—');
}

function getBaseName() {
  return currentProfile.full_name || getDisplayName(currentUser || {}) || 'FitLife User';
}

function parseListInput(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function applyProfileToDom(profile) {
  const displayName = profile.full_name || getDisplayName(currentUser || {}) || 'FitLife User';
  const fields = {
    name: displayName,
    calories: profile.calories ? `${profile.calories}` : '—',
    weight: profile.weight ? `${profile.weight}kg` : '—',
    height: profile.height ? `${profile.height}cm` : '—',
    age: profile.age || '—',
    protein: `${profile.protein || 0}g`,
    carbs: `${profile.carbs || 0}g`,
    fat: `${profile.fat || 0}g`,
    goal: labelForGoal(profile.goal),
    activity: labelForActivity(profile.activity_level),
    diet: labelForDiet(profile.diet_type),
    gender: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—',
    restrictions: (profile.restrictions || []).join(', ') || 'None',
  };

  document.querySelectorAll('[data-profile-field]').forEach((node) => {
    const key = node.getAttribute('data-profile-field');
    if (key && fields[key] !== undefined) node.textContent = fields[key];
  });

  const initialNode = document.getElementById('profileAvatarInitial');
  if (initialNode) initialNode.textContent = displayName.charAt(0).toUpperCase();
}

function toggleEdit(force = null) {
  isEditing = force === null ? !isEditing : Boolean(force);
  const editSection = document.getElementById('editSection');
  const viewSection = document.getElementById('viewSection');
  const editBtn = document.getElementById('editToggleBtn');

  editSection?.classList.toggle('hidden', !isEditing);
  viewSection?.classList.toggle('hidden', isEditing);

  if (editBtn) {
    editBtn.innerHTML = isEditing
      ? '<span class="material-symbols-outlined text-sm">close</span> Cancel'
      : '<span class="material-symbols-outlined text-sm">edit</span> Edit Profile';
  }
}

function collectProfileUpdates() {
  const updates = {};
  const nameInput = document.getElementById('editName');
  const weightInput = document.getElementById('editWeight');
  const heightInput = document.getElementById('editHeight');
  const ageInput = document.getElementById('editAge');
  const goalSelect = document.getElementById('editGoal');
  const activitySelect = document.getElementById('editActivity');
  const genderSelect = document.getElementById('editGender');
  const dietSelect = document.getElementById('editDiet');
  const restrictionsInput = document.getElementById('editRestrictions');

  if (nameInput) updates.full_name = nameInput.value.trim();
  if (weightInput) updates.weight = weightInput.value;
  if (heightInput) updates.height = heightInput.value;
  if (ageInput) updates.age = ageInput.value;
  if (goalSelect) updates.goal = goalSelect.value;
  if (activitySelect) updates.activity_level = activitySelect.value;
  if (genderSelect) updates.gender = genderSelect.value;
  if (dietSelect) updates.diet_type = dietSelect.value;
  if (restrictionsInput) updates.restrictions = parseListInput(restrictionsInput.value);

  return updates;
}

function setupProfileHandlers() {
  window._profileSignOut = async () => {
    const result = await signOut();
    if (result.success) window.location.hash = '/landing';
  };

  window._toggleEdit = () => toggleEdit();

  window._pickAvatar = () => {
    const colors = [
      'from-primary/30 to-emerald-500/20',
      'from-blue-500/30 to-cyan-400/20',
      'from-purple-500/30 to-pink-400/20',
      'from-orange-500/30 to-yellow-400/20',
      'from-red-500/30 to-rose-400/20',
    ];
    const avatarEl = document.getElementById('avatarGradient');
    if (!avatarEl) return;
    const current = avatarEl.dataset.colorIdx || '0';
    const next = (parseInt(current, 10) + 1) % colors.length;
    avatarEl.dataset.colorIdx = String(next);
    avatarEl.className = `w-24 h-24 rounded-full bg-gradient-to-br ${colors[next]} flex items-center justify-center border-2 border-primary/30 cursor-pointer transition-all hover:scale-105`;
    avatarEl.style.boxShadow = '0 0 30px rgba(34,197,94,0.15)';
  };

  window._saveProfile = async () => {
    if (isSaving) return;
    isSaving = true;

    const btn = document.getElementById('saveProfileBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Saving...';
    }

    const previousProfile = { ...currentProfile };
    const updates = collectProfileUpdates();
    const optimisticProfile = { ...currentProfile, ...updates };

    currentProfile = optimisticProfile;
    applyProfileToDom(currentProfile);
    toggleEdit(false);

    const result = await withLoading('profile-update', () => updateProfileField(updates));

    isSaving = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Save Changes';
    }

    if (result.success) {
      currentProfile = result.data?.profile || optimisticProfile;
      applyProfileToDom(currentProfile);
      toast.success(result.data?.recalculated ? 'Profile updated. Targets recalculated.' : 'Profile updated.');
      emit(EVENTS.PROFILE_UPDATED, { profile: currentProfile });
    } else {
      currentProfile = previousProfile;
      applyProfileToDom(currentProfile);
      toggleEdit(true);
      toast.error(result.message || 'Update failed');
    }
  };

  window._quickWeightUpdate = () => {
    const input = document.getElementById('quickWeight');
    const section = document.getElementById('quickWeightSection');
    if (!input || !section) return;
    input.value = currentProfile.weight || '';
    section.classList.toggle('hidden');
    if (!section.classList.contains('hidden')) input.focus();
  };

  window._saveQuickWeight = async () => {
    if (isSaving) return;
    const input = document.getElementById('quickWeight');
    const btn = document.getElementById('quickWeightBtn');
    const weight = Number(input?.value || 0);
    if (!Number.isFinite(weight) || weight < 20 || weight > 300) {
      toast.error('Enter a valid weight between 20 and 300 kg.');
      return;
    }

    isSaving = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    const previousProfile = { ...currentProfile };
    currentProfile = { ...currentProfile, weight };
    applyProfileToDom(currentProfile);

    const result = await withLoading('profile-weight', () => updateProfileField({ weight }));

    isSaving = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save';
    }

    if (result.success) {
      currentProfile = result.data?.profile || currentProfile;
      applyProfileToDom(currentProfile);
      document.getElementById('quickWeightSection')?.classList.add('hidden');
      toast.success('Weight updated. Targets recalculated.');
      emit(EVENTS.PROFILE_UPDATED, { profile: currentProfile });
    } else {
      currentProfile = previousProfile;
      applyProfileToDom(currentProfile);
      toast.error(result.message || 'Update failed');
    }
  };
}

function renderStatCard(label, value, color) {
  return `
    <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center min-w-0">
      <p class="text-lg font-bold text-${color} truncate">${value}</p>
      <p class="text-[9px] text-on-surface-variant uppercase">${label}</p>
    </div>`;
}

export async function renderProfile() {
  const userRes = await getCurrentUser();
  const user = userRes.data?.user;
  if (!user) {
    window.location.hash = '/auth';
    return '';
  }

  currentUser = user;

  const profileRes = await getNutritionProfile();
  currentProfile = profileRes.data?.profile || {};

  isEditing = false;
  isSaving = false;
  setTimeout(() => {
    setupProfileHandlers();
    applyProfileToDom(currentProfile);
  }, 50);

  const displayName = currentProfile.full_name || getDisplayName(user);
  const restrictionsText = (currentProfile.restrictions || []).join(', ');

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-28 pl-safe pr-safe">
      ${renderPageHeader({ title: 'Profile', subtitle: 'Your fitness identity' })}

      <div class="px-5 py-5 space-y-5 max-w-lg mx-auto overflow-x-hidden">
        <div class="flex flex-col items-center p-6 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 relative">
          <div id="avatarGradient" data-color-idx="0"
               onclick="window._pickAvatar && window._pickAvatar()"
               class="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary-container/40 flex items-center justify-center border-2 border-primary/30 cursor-pointer transition-all hover:scale-105"
               style="box-shadow: 0 0 30px rgba(34,197,94,0.15);">
            <span id="profileAvatarInitial" class="text-3xl font-bold text-primary">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>
          </div>
          <h2 class="text-lg font-bold mt-3 text-center break-words" data-profile-field="name">${escapeHtml(displayName)}</h2>
          <p class="text-xs text-on-surface-variant break-all">${escapeHtml(user.email || '')}</p>

          <button id="editToggleBtn" onclick="window._toggleEdit && window._toggleEdit()"
                  class="absolute top-4 right-4 px-3 py-2 rounded-full text-xs font-semibold text-primary border border-primary/20 hover:bg-primary/10 transition-all flex items-center gap-1 min-h-[44px]">
            <span class="material-symbols-outlined text-sm">edit</span> Edit Profile
          </button>
        </div>

        <div id="viewSection">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            ${renderStatCard('Cal/Day', currentProfile.calories || '—', 'primary')
              .replace(`${currentProfile.calories || '—'}`, `<span data-profile-field="calories">${currentProfile.calories || '—'}</span>`)}
            ${renderStatCard('Weight', currentProfile.weight ? `${currentProfile.weight}kg` : '—', 'secondary')
              .replace(currentProfile.weight ? `${currentProfile.weight}kg` : '—', `<span data-profile-field="weight">${currentProfile.weight ? `${currentProfile.weight}kg` : '—'}</span>`)}
            ${renderStatCard('Height', currentProfile.height ? `${currentProfile.height}cm` : '—', 'tertiary')
              .replace(currentProfile.height ? `${currentProfile.height}cm` : '—', `<span data-profile-field="height">${currentProfile.height ? `${currentProfile.height}cm` : '—'}</span>`)}
            ${renderStatCard('Age', currentProfile.age || '—', 'primary')
              .replace(`${currentProfile.age || '—'}`, `<span data-profile-field="age">${currentProfile.age || '—'}</span>`)}
          </div>

          <div class="p-4 rounded-xl border border-primary/10 bg-primary/5 mb-5">
            <h3 class="text-xs font-bold text-primary uppercase tracking-wider mb-3">Daily Targets</h3>
            <div class="grid grid-cols-3 gap-3">
              <div class="text-center">
                <p class="text-lg font-bold text-primary" data-profile-field="protein">${currentProfile.protein || 0}g</p>
                <p class="text-[10px] text-on-surface-variant">Protein</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-secondary" data-profile-field="carbs">${currentProfile.carbs || 0}g</p>
                <p class="text-[10px] text-on-surface-variant">Carbs</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-tertiary" data-profile-field="fat">${currentProfile.fat || 0}g</p>
                <p class="text-[10px] text-on-surface-variant">Fat</p>
              </div>
            </div>
          </div>

          <div class="space-y-2 mb-5">
            ${[
              { icon: 'flag', label: 'Goal', field: 'goal', value: labelForGoal(currentProfile.goal) },
              { icon: 'directions_run', label: 'Activity', field: 'activity', value: labelForActivity(currentProfile.activity_level) },
              { icon: 'restaurant', label: 'Diet', field: 'diet', value: labelForDiet(currentProfile.diet_type) },
              { icon: 'person', label: 'Gender', field: 'gender', value: currentProfile.gender ? currentProfile.gender.charAt(0).toUpperCase() + currentProfile.gender.slice(1) : '—' },
              { icon: 'list_alt', label: 'Restrictions', field: 'restrictions', value: restrictionsText || 'None' },
            ].map((item) => `
              <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 min-w-0">
                <span class="material-symbols-outlined text-on-surface-variant text-lg flex-shrink-0">${item.icon}</span>
                <span class="text-xs text-on-surface-variant flex-1">${item.label}</span>
                <span class="text-sm font-semibold text-on-surface capitalize text-right break-words max-w-[55%]" data-profile-field="${item.field}">${item.value}</span>
              </div>
            `).join('')}
          </div>

          <div class="mb-5">
            <button onclick="window._quickWeightUpdate && window._quickWeightUpdate()"
                    class="w-full p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 transition-all flex items-center gap-3 min-h-[44px]">
              <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">scale</span>
              </div>
              <div class="flex-1 text-left min-w-0">
                <p class="text-sm font-bold text-on-surface">Update Weight</p>
                <p class="text-[10px] text-on-surface-variant">Quick weight check-in</p>
              </div>
              <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
            </button>
            <div id="quickWeightSection" class="hidden mt-3 p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
              <div class="flex gap-3 items-end flex-wrap sm:flex-nowrap">
                <div class="flex-1 min-w-[180px]">
                  <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Weight (kg)</label>
                  <input id="quickWeight" type="number" min="20" max="300" step="0.1" placeholder="${currentProfile.weight || 'Enter weight'}"
                         class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
                </div>
                <button id="quickWeightBtn" onclick="window._saveQuickWeight && window._saveQuickWeight()"
                        class="px-6 py-3 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm min-h-[44px]">Save</button>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            ${[
              { icon: 'tune', label: 'Redo Onboarding', action: "window.location.hash='/onboarding'" },
              { icon: 'workspace_premium', label: 'Premium', action: "window.location.hash='/premium'" },
              { icon: 'history', label: 'Meal History', action: "window.location.hash='/history'" },
              { icon: 'monitoring', label: 'Body Progress', action: "window.location.hash='/progress'" },
              { icon: 'local_fire_department', label: 'Streaks', action: "window.location.hash='/streaks'" },
            ].map((item) => `
              <button onclick="${item.action}" class="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 hover:bg-surface-container/50 transition-all min-h-[44px]">
                <span class="material-symbols-outlined text-on-surface-variant text-xl">${item.icon}</span>
                <span class="flex-1 text-left text-sm font-medium text-on-surface">${item.label}</span>
                <span class="material-symbols-outlined text-on-surface-variant/40 text-lg">chevron_right</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div id="editSection" class="hidden space-y-4">
          <div class="p-5 rounded-2xl border border-primary/20 bg-surface-container-low/50 space-y-4">
            <h3 class="text-sm font-bold text-primary uppercase tracking-wider">Edit Profile</h3>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Full Name</label>
              <input id="editName" type="text" value="${escapeHtml(displayName)}" maxlength="60"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Weight (kg)</label>
                <input id="editWeight" type="number" min="20" max="300" step="0.1" value="${currentProfile.weight || ''}" placeholder="70"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Height (cm)</label>
                <input id="editHeight" type="number" min="80" max="250" step="1" value="${currentProfile.height || ''}" placeholder="175"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Age</label>
                <input id="editAge" type="number" min="10" max="120" step="1" value="${currentProfile.age || ''}" placeholder="25"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Gender</label>
              <select id="editGender" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                <option value="male" ${currentProfile.gender === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${currentProfile.gender === 'female' ? 'selected' : ''}>Female</option>
                <option value="neutral" ${!currentProfile.gender || currentProfile.gender === 'neutral' ? 'selected' : ''}>Prefer not to say</option>
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Fitness Goal</label>
              <select id="editGoal" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                ${['build-muscle', 'lose-weight', 'improve-health', 'maintain'].map((goal) => `
                  <option value="${goal}" ${currentProfile.goal === goal ? 'selected' : ''}>${labelForGoal(goal)}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Activity Level</label>
              <select id="editActivity" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                ${['sedentary', 'lightly-active', 'moderately-active', 'very-active'].map((activity) => `
                  <option value="${activity}" ${currentProfile.activity_level === activity ? 'selected' : ''}>${labelForActivity(activity)}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Dietary Preference</label>
              <select id="editDiet" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                ${['balanced', 'vegetarian', 'vegan', 'keto', 'paleo', 'mediterranean', 'high-protein', 'halal'].map((diet) => `
                  <option value="${diet}" ${currentProfile.diet_type === diet ? 'selected' : ''}>${labelForDiet(diet)}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Restrictions</label>
              <input id="editRestrictions" type="text" value="${escapeHtml(restrictionsText)}" placeholder="e.g. lactose, peanuts"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
              <p class="text-[10px] text-on-surface-variant mt-1">Separate multiple items with commas.</p>
            </div>

            <button id="saveProfileBtn" onclick="window._saveProfile && window._saveProfile()"
                    class="w-full py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-h-[44px]">
              <span class="material-symbols-outlined text-lg">save</span> Save Changes
            </button>

            <p class="text-[10px] text-on-surface-variant text-center">Weight, height, age, goal, activity level, and gender automatically recalculate your deterministic macro targets.</p>
          </div>
        </div>

        <button onclick="window._profileSignOut && window._profileSignOut()"
                class="w-full py-3 rounded-full border border-error/30 text-error font-semibold text-sm hover:bg-error/10 transition-all flex items-center justify-center gap-2 min-h-[44px]">
          <span class="material-symbols-outlined text-lg">logout</span> Sign Out
        </button>

        <p class="text-center text-[10px] text-on-surface-variant/40">FitLife v2.0.0 · Deterministic nutrition engine enabled</p>
      </div>

      ${renderNavBar()}
    </div>`;
}

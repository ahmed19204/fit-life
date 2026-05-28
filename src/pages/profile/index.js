/**
 * FitLife Profile & Settings
 * Full profile editing: name, avatar, weight, height, goal, activity level.
 * Auto-recalculates nutrition targets when body metrics change.
 */
import { getCurrentUser, getDisplayName, signOut } from '../../services/auth.js';
import { getNutritionProfile, updateProfileField, invalidateProfileCache } from '../../services/ai.js';
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { emit, EVENTS } from '../../services/events.js';

let isEditing = false;
let isSaving = false;

function setupProfileHandlers(user, profile) {
  // Sign out
  window._profileSignOut = async () => {
    await signOut();
    window.location.hash = '/landing';
  };

  // Toggle edit mode
  window._toggleEdit = () => {
    isEditing = !isEditing;
    const editSection = document.getElementById('editSection');
    const viewSection = document.getElementById('viewSection');
    const editBtn = document.getElementById('editToggleBtn');
    if (editSection && viewSection) {
      editSection.classList.toggle('hidden', !isEditing);
      viewSection.classList.toggle('hidden', isEditing);
    }
    if (editBtn) {
      editBtn.innerHTML = isEditing
        ? '<span class="material-symbols-outlined text-sm">close</span> Cancel'
        : '<span class="material-symbols-outlined text-sm">edit</span> Edit Profile';
    }
  };

  // Avatar initial selection
  window._pickAvatar = () => {
    // Simple avatar: cycle through color gradients
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
    const next = (parseInt(current) + 1) % colors.length;
    avatarEl.dataset.colorIdx = next;
    avatarEl.className = `w-24 h-24 rounded-full bg-gradient-to-br ${colors[next]} flex items-center justify-center border-2 border-primary/30 cursor-pointer transition-all hover:scale-105`;
    avatarEl.style.boxShadow = '0 0 30px rgba(34,197,94,0.15)';
  };

  // Save profile
  window._saveProfile = async () => {
    if (isSaving) return;
    isSaving = true;
    const btn = document.getElementById('saveProfileBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Saving...'; }

    const updates = {};
    const nameInput = document.getElementById('editName');
    const weightInput = document.getElementById('editWeight');
    const heightInput = document.getElementById('editHeight');
    const ageInput = document.getElementById('editAge');
    const goalSelect = document.getElementById('editGoal');
    const activitySelect = document.getElementById('editActivity');
    const genderSelect = document.getElementById('editGender');

    if (nameInput?.value?.trim()) updates.full_name = nameInput.value.trim();
    if (weightInput?.value) updates.weight = parseFloat(weightInput.value);
    if (heightInput?.value) updates.height = parseFloat(heightInput.value);
    if (ageInput?.value) updates.age = parseInt(ageInput.value);
    if (goalSelect?.value) updates.goal = goalSelect.value;
    if (activitySelect?.value) updates.activity_level = activitySelect.value;
    if (genderSelect?.value) updates.gender = genderSelect.value;

    const result = await updateProfileField(updates);
    isSaving = false;

    if (result.success) {
      // Show success toast
      const toast = document.getElementById('profileToast');
      if (toast) {
        const msg = result.data?.recalculated
          ? 'Profile saved! Nutrition targets recalculated.'
          : 'Profile saved!';
        toast.querySelector('#profileToastText').textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(-50%) translateY(10px)';
        }, 2500);
      }

      emit(EVENTS.PROFILE_UPDATED, { profile: result.data?.profile });
      
      // Refresh the page to show updated data
      setTimeout(() => {
        isEditing = false;
        window.location.hash = '/profile';
      }, 1200);
    } else {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Save Changes'; }
      alert(result.message || 'Failed to save profile.');
    }
  };

  // Quick weight update (separate from full edit)
  window._quickWeightUpdate = () => {
    const input = document.getElementById('quickWeight');
    if (!input) return;
    const current = profile.weight || '';
    input.value = current;
    document.getElementById('quickWeightSection')?.classList.toggle('hidden');
    input.focus();
  };

  window._saveQuickWeight = async () => {
    const input = document.getElementById('quickWeight');
    const weight = parseFloat(input?.value);
    if (!weight || weight < 20 || weight > 300) return;

    const btn = document.getElementById('quickWeightBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    const result = await updateProfileField({ weight });
    if (result.success) {
      const toast = document.getElementById('profileToast');
      if (toast) {
        toast.querySelector('#profileToastText').textContent = 'Weight updated! Targets recalculated.';
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(-50%) translateY(10px)';
        }, 2500);
      }
      emit(EVENTS.PROFILE_UPDATED, { profile: result.data?.profile });
      setTimeout(() => { window.location.hash = '/profile'; }, 1200);
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  };
}

export async function renderProfile() {
  const userRes = await getCurrentUser();
  const user = userRes.data?.user;
  if (!user) { window.location.hash = '/auth'; return ''; }
  
  const name = getDisplayName(user);
  const profileRes = await getNutritionProfile();
  const p = profileRes.data?.profile || {};

  isEditing = false;
  isSaving = false;
  setTimeout(() => setupProfileHandlers(user, p), 50);

  const goalLabel = { 'build-muscle': 'Build Muscle', 'lose-weight': 'Lose Weight', 'improve-health': 'Improve Health', 'maintain': 'Maintain' }[p.goal] || p.goal || '—';
  const activityLabel = { 'sedentary': 'Sedentary', 'lightly-active': 'Lightly Active', 'moderately-active': 'Moderately Active', 'very-active': 'Very Active' }[p.activity_level] || p.activity_level || '—';

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Profile', subtitle: 'Your fitness identity' })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- Avatar Card -->
        <div class="flex flex-col items-center p-6 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50 relative">
          <div id="avatarGradient" data-color-idx="0"
               onclick="window._pickAvatar && window._pickAvatar()"
               class="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary-container/40 flex items-center justify-center border-2 border-primary/30 cursor-pointer transition-all hover:scale-105"
               style="box-shadow: 0 0 30px rgba(34,197,94,0.15);">
            <span class="text-3xl font-bold text-primary">${(p.full_name || name).charAt(0).toUpperCase()}</span>
          </div>
          <h2 class="text-lg font-bold mt-3">${p.full_name || name}</h2>
          <p class="text-xs text-on-surface-variant">${user.email}</p>
          
          <!-- Edit Toggle -->
          <button id="editToggleBtn" onclick="window._toggleEdit && window._toggleEdit()"
                  class="absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-semibold text-primary border border-primary/20 hover:bg-primary/10 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">edit</span> Edit Profile
          </button>
        </div>

        <!-- VIEW Mode: Stats Summary -->
        <div id="viewSection">
          <!-- Quick Stats -->
          <div class="grid grid-cols-4 gap-2 mb-5">
            ${[
              { label: 'Cal/Day', value: p.calories || '—', color: 'primary' },
              { label: 'Weight', value: p.weight ? `${p.weight}kg` : '—', color: 'secondary' },
              { label: 'Height', value: p.height ? `${p.height}cm` : '—', color: 'tertiary' },
              { label: 'Age', value: p.age || '—', color: 'primary' },
            ].map(s => `
              <div class="p-3 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
                <p class="text-lg font-bold text-${s.color}">${s.value}</p>
                <p class="text-[9px] text-on-surface-variant uppercase">${s.label}</p>
              </div>
            `).join('')}
          </div>

          <!-- Nutrition Targets -->
          <div class="p-4 rounded-xl border border-primary/10 bg-primary/5 mb-5">
            <h3 class="text-xs font-bold text-primary uppercase tracking-wider mb-3">Daily Targets</h3>
            <div class="grid grid-cols-3 gap-3">
              ${[
                { label: 'Protein', value: `${p.protein || 0}g`, color: '#22c55e' },
                { label: 'Carbs', value: `${p.carbs || 0}g`, color: '#9ddf2e' },
                { label: 'Fat', value: `${p.fat || 0}g`, color: '#ffb5ab' },
              ].map(m => `
                <div class="text-center">
                  <p class="text-lg font-bold" style="color: ${m.color};">${m.value}</p>
                  <p class="text-[10px] text-on-surface-variant">${m.label}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Profile Details -->
          <div class="space-y-2 mb-5">
            ${[
              { icon: 'flag', label: 'Goal', value: goalLabel },
              { icon: 'directions_run', label: 'Activity', value: activityLabel },
              { icon: 'restaurant', label: 'Diet', value: p.diet_type || '—' },
              { icon: 'person', label: 'Gender', value: (p.gender || '—').charAt(0).toUpperCase() + (p.gender || '—').slice(1) },
            ].map(item => `
              <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
                <span class="material-symbols-outlined text-on-surface-variant text-lg">${item.icon}</span>
                <span class="text-xs text-on-surface-variant flex-1">${item.label}</span>
                <span class="text-sm font-semibold text-on-surface capitalize">${item.value}</span>
              </div>
            `).join('')}
          </div>

          <!-- Quick Weight Update -->
          <div class="mb-5">
            <button onclick="window._quickWeightUpdate && window._quickWeightUpdate()"
                    class="w-full p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 transition-all flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">scale</span>
              </div>
              <div class="flex-1 text-left">
                <p class="text-sm font-bold text-on-surface">Update Weight</p>
                <p class="text-[10px] text-on-surface-variant">Quick weight check-in</p>
              </div>
              <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
            </button>
            <div id="quickWeightSection" class="hidden mt-3 p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
              <div class="flex gap-3 items-end">
                <div class="flex-1">
                  <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Weight (kg)</label>
                  <input id="quickWeight" type="number" min="20" max="300" step="0.1" placeholder="${p.weight || 'Enter weight'}"
                         class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
                </div>
                <button id="quickWeightBtn" onclick="window._saveQuickWeight && window._saveQuickWeight()"
                        class="px-6 py-3 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm">Save</button>
              </div>
            </div>
          </div>

          <!-- Settings -->
          <div class="space-y-2">
            ${[
              { icon: 'tune', label: 'Redo Onboarding', action: "window.location.hash='/onboarding'" },
              { icon: 'workspace_premium', label: 'Premium', action: "window.location.hash='/premium'" },
              { icon: 'history', label: 'Meal History', action: "window.location.hash='/history'" },
              { icon: 'monitoring', label: 'Body Progress', action: "window.location.hash='/progress'" },
              { icon: 'local_fire_department', label: 'Streaks', action: "window.location.hash='/streaks'" },
            ].map(item => `
              <button onclick="${item.action}" class="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 hover:bg-surface-container/50 transition-all">
                <span class="material-symbols-outlined text-on-surface-variant text-xl">${item.icon}</span>
                <span class="flex-1 text-left text-sm font-medium text-on-surface">${item.label}</span>
                <span class="material-symbols-outlined text-on-surface-variant/40 text-lg">chevron_right</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- EDIT Mode: Full Form -->
        <div id="editSection" class="hidden space-y-4">
          <div class="p-5 rounded-2xl border border-primary/20 bg-surface-container-low/50 space-y-4">
            <h3 class="text-sm font-bold text-primary uppercase tracking-wider">Edit Profile</h3>
            
            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Full Name</label>
              <input id="editName" type="text" value="${p.full_name || name}" maxlength="60"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none">
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Weight (kg)</label>
                <input id="editWeight" type="number" min="20" max="300" step="0.1" value="${p.weight || ''}" placeholder="70"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Height (cm)</label>
                <input id="editHeight" type="number" min="80" max="250" step="1" value="${p.height || ''}" placeholder="175"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
              <div>
                <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Age</label>
                <input id="editAge" type="number" min="10" max="120" step="1" value="${p.age || ''}" placeholder="25"
                       class="w-full px-3 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
              </div>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Gender</label>
              <select id="editGender" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                <option value="male" ${p.gender === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${p.gender === 'female' ? 'selected' : ''}>Female</option>
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Fitness Goal</label>
              <select id="editGoal" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                ${['build-muscle', 'lose-weight', 'improve-health', 'maintain'].map(g =>
                  `<option value="${g}" ${p.goal === g ? 'selected' : ''}>${g.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
                ).join('')}
              </select>
            </div>

            <div>
              <label class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1 block">Activity Level</label>
              <select id="editActivity" class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none">
                ${['sedentary', 'lightly-active', 'moderately-active', 'very-active'].map(a =>
                  `<option value="${a}" ${p.activity_level === a ? 'selected' : ''}>${a.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
                ).join('')}
              </select>
            </div>

            <button id="saveProfileBtn" onclick="window._saveProfile && window._saveProfile()"
                    class="w-full py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-lg">save</span> Save Changes
            </button>

            <p class="text-[10px] text-on-surface-variant text-center">Changing weight, height, age, goal, or activity level will auto-recalculate your nutrition targets.</p>
          </div>
        </div>

        <!-- Sign Out -->
        <button onclick="window._profileSignOut && window._profileSignOut()"
                class="w-full py-3 rounded-full border border-error/30 text-error font-semibold text-sm hover:bg-error/10 transition-all flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-lg">logout</span> Sign Out
        </button>

        <p class="text-center text-[10px] text-on-surface-variant/40">FitLife v2.0.0 &middot; AI-Powered Fitness</p>

        <!-- Toast -->
        <div id="profileToast" class="fixed bottom-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/30 opacity-0 pointer-events-none transition-all duration-300 z-50 flex items-center gap-2" style="transform: translateX(-50%) translateY(10px);">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">check_circle</span>
          <span id="profileToastText">Profile saved!</span>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;
}

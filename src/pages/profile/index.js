/**
 * FitLife Profile & Settings
 */
import { getCurrentUser, getDisplayName, signOut } from '../../services/auth.js';
import { getNutritionProfile } from '../../services/ai.js';
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';

export async function renderProfile() {
  const userRes = await getCurrentUser();
  const user = userRes.data?.user;
  if (!user) { window.location.hash = '/auth'; return ''; }
  
  const name = getDisplayName(user);
  const profileRes = await getNutritionProfile();
  const p = profileRes.data?.profile || {};

  setTimeout(() => {
    window.handleSignOut = async () => {
      await signOut();
      window.location.hash = '/landing';
    };
  }, 50);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-24">
      ${renderPageHeader({ title: 'Profile', subtitle: 'Your fitness identity' })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- Avatar Card -->
        <div class="flex flex-col items-center p-6 rounded-2xl border border-outline-variant/10 bg-surface-container-low/50">
          <div class="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary-container/40 flex items-center justify-center border-2 border-primary/30 mb-3"
               style="box-shadow: 0 0 30px rgba(34,197,94,0.15);">
            <span class="text-2xl font-bold text-primary">${name.charAt(0).toUpperCase()}</span>
          </div>
          <h2 class="text-lg font-bold">${name}</h2>
          <p class="text-xs text-on-surface-variant">${user.email}</p>
          <div class="flex gap-4 mt-4">
            <div class="text-center"><p class="text-lg font-bold text-primary">${p.calories || '—'}</p><p class="text-[9px] text-on-surface-variant uppercase">Cal/Day</p></div>
            <div class="w-px bg-outline-variant/20"></div>
            <div class="text-center"><p class="text-lg font-bold text-secondary">${p.goal?.replace(/-/g,' ') || '—'}</p><p class="text-[9px] text-on-surface-variant uppercase">Goal</p></div>
            <div class="w-px bg-outline-variant/20"></div>
            <div class="text-center"><p class="text-lg font-bold text-tertiary">${p.diet_type || '—'}</p><p class="text-[9px] text-on-surface-variant uppercase">Diet</p></div>
          </div>
        </div>

        <!-- Settings -->
        <div class="space-y-2">
          ${[
            { icon: 'tune', label: 'Edit Nutrition Plan', action: "window.location.hash='/onboarding'" },
            { icon: 'workspace_premium', label: 'Premium Membership', action: "window.location.hash='/premium'" },
            { icon: 'history', label: 'Meal History', action: "window.location.hash='/history'" },
            { icon: 'monitoring', label: 'Body Progress', action: "window.location.hash='/progress'" },
            { icon: 'local_fire_department', label: 'Streaks & Achievements', action: "window.location.hash='/streaks'" },
            { icon: 'notifications', label: 'Notifications', action: "window.location.hash='/notifications'" },
            { icon: 'shield', label: 'Privacy & Security', action: '' },
            { icon: 'help', label: 'Help & Support', action: '' },
          ].map(item => `
            <button onclick="${item.action}" class="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 hover:bg-surface-container/50 transition-all">
              <span class="material-symbols-outlined text-on-surface-variant text-xl">${item.icon}</span>
              <span class="flex-1 text-left text-sm font-medium text-on-surface">${item.label}</span>
              <span class="material-symbols-outlined text-on-surface-variant/40 text-lg">chevron_right</span>
            </button>
          `).join('')}
        </div>

        <!-- Sign Out -->
        <button onclick="handleSignOut()"
                class="w-full py-3 rounded-full border border-error/30 text-error font-semibold text-sm hover:bg-error/10 transition-all flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-lg">logout</span> Sign Out
        </button>

        <p class="text-center text-[10px] text-on-surface-variant/40">FitLife v1.0.0 &middot; Made with AI</p>
      </div>

      ${renderNavBar()}
    </div>`;
}

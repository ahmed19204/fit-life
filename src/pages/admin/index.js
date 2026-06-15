/**
 * FitLife Admin Dashboard
 * Full admin panel with real Supabase data for user management,
 * analytics, AI usage monitoring, and system health.
 */
import { renderPageHeader } from '../../components/page-header.js';
import { getCurrentUser, getDisplayName } from '../../services/auth.js';
import { supabase } from '../../services/supabase.js';

// Admin whitelist — in production, replace with a Supabase role/column check
const ADMIN_EMAILS = ['admin@fitlife.com'];

async function fetchAdminStats() {
  const stats = {
    totalUsers: '—', activeToday: '—', aiGenerations: '—', 
    totalMeals: '—', recentUsers: [], recentMeals: [],
  };

  try {
    // Total users
    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    stats.totalUsers = userCount ?? '—';

    // Users with profiles (onboarding completed)
    const { count: profileCount } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
    stats.aiGenerations = profileCount ?? '—';

    // Total meals
    const { count: mealCount } = await supabase.from('meals').select('*', { count: 'exact', head: true });
    stats.totalMeals = mealCount ?? '—';

    // Recent users
    const { data: users } = await supabase.from('profiles').select('id, email, full_name, created_at')
      .order('created_at', { ascending: false }).limit(5);
    stats.recentUsers = users || [];

    // Recent meals
    const { data: meals } = await supabase.from('meals').select('id, name, type, calories, created_at, user_id')
      .order('created_at', { ascending: false }).limit(10);
    stats.recentMeals = meals || [];

    // Active today (users who logged meals today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayMeals } = await supabase.from('meals').select('user_id')
      .gte('created_at', today.toISOString());
    const uniqueUsers = new Set((todayMeals || []).map(m => m.user_id));
    stats.activeToday = uniqueUsers.size;
  } catch (e) {
    console.error('[Admin] Error fetching stats:', e);
  }

  return stats;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function renderAdmin() {
  const userRes = await getCurrentUser();
  if (!userRes.success) { window.location.hash = '/auth'; return ''; }

  const user = userRes.data.user;

  // Enforce admin access — redirect non-admins
  if (!ADMIN_EMAILS.includes(user.email)) {
    return `
      <div class="min-h-screen bg-surface text-on-surface flex items-center justify-center px-6 pl-safe pr-safe pt-safe pb-safe overflow-x-hidden" style="min-height:100dvh;">
        <div class="text-center max-w-md">
          <span class="material-symbols-outlined text-error text-5xl mb-4 block">shield</span>
          <h2 class="text-xl font-bold text-on-surface mb-2">Access Denied</h2>
          <p class="text-sm text-on-surface-variant mb-6">You don't have admin privileges. Contact your administrator.</p>
          <button onclick="window.location.hash='/dashboard'" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm min-h-[44px]">Go to Dashboard</button>
        </div>
      </div>`;
  }

  const stats = await fetchAdminStats();

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-8 pb-safe pl-safe pr-safe overflow-x-hidden" style="min-height:100dvh;">
      ${renderPageHeader({ title: 'Admin Dashboard', subtitle: 'Ecosystem Control Center', showBack: true })}
      
      <div class="px-5 py-5 space-y-5">
        <!-- Admin Identity -->
        <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-primary/10">
          <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">shield_person</span>
          </div>
          <div>
            <p class="text-sm font-bold text-on-surface">${getDisplayName(user)}</p>
            <p class="text-[10px] text-primary font-medium">Admin Access</p>
          </div>
        </div>

        <!-- Stats Overview -->
        <div class="grid grid-cols-2 gap-3">
          ${[
            { label: 'Total Users', value: stats.totalUsers, icon: 'group', color: 'primary', trend: '' },
            { label: 'Active Today', value: stats.activeToday, icon: 'person_pin', color: 'secondary', trend: '' },
            { label: 'AI Profiles', value: stats.aiGenerations, icon: 'neurology', color: 'primary', trend: '' },
            { label: 'Meals Logged', value: stats.totalMeals, icon: 'restaurant', color: 'tertiary', trend: '' },
          ].map(s => `
            <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 hover:border-primary/20 transition-all">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-${s.color} text-lg" style="font-variation-settings: 'FILL' 1;">${s.icon}</span>
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider">${s.label}</span>
              </div>
              <p class="text-2xl font-bold text-on-surface">${s.value}</p>
            </div>
          `).join('')}
        </div>

        <!-- Recent Users -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Recent Users</h3>
          ${stats.recentUsers.length > 0 ? `
            <div class="space-y-2">
              ${stats.recentUsers.map(u => `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
                  <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-bold text-primary">${(u.full_name || u.email || '?').charAt(0).toUpperCase()}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-on-surface truncate">${u.full_name || 'No name'}</p>
                    <p class="text-[10px] text-on-surface-variant truncate">${u.email || 'No email'}</p>
                  </div>
                  <span class="text-[10px] text-on-surface-variant/60 flex-shrink-0">${formatDate(u.created_at)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <p class="text-xs text-on-surface-variant">No users found. RLS policies may restrict access.</p>
            </div>
          `}
        </div>

        <!-- Recent Meals -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Recent Meal Logs</h3>
          ${stats.recentMeals.length > 0 ? `
            <div class="space-y-2">
              ${stats.recentMeals.slice(0, 5).map(m => `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5">
                  <div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-on-surface-variant text-lg">restaurant</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-on-surface truncate">${m.name}</p>
                    <p class="text-[10px] text-on-surface-variant">${m.type || 'Meal'}</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-bold text-primary">${m.calories || 0}</p>
                    <p class="text-[9px] text-on-surface-variant">${formatDate(m.created_at)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30 text-center">
              <p class="text-xs text-on-surface-variant">No meals found.</p>
            </div>
          `}
        </div>

        <!-- Admin Sections -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Management</h3>
          <div class="space-y-2">
            ${[
              { icon: 'manage_accounts', label: 'User Management', desc: 'View, edit, and manage user accounts' },
              { icon: 'subscriptions', label: 'Subscriptions', desc: 'Manage premium plans and billing' },
              { icon: 'analytics', label: 'Analytics', desc: 'Usage and engagement data' },
              { icon: 'neurology', label: 'AI Monitoring', desc: 'AI generation stats and error logs' },
              { icon: 'support_agent', label: 'Support', desc: 'User support and feedback' },
              { icon: 'notifications_active', label: 'Push Notifications', desc: 'Send notifications to users' },
              { icon: 'security', label: 'Security', desc: 'RLS policies and access control' },
              { icon: 'assessment', label: 'Reports', desc: 'Generate and export system reports' },
            ].map(item => `
              <div class="flex items-center gap-4 p-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 hover:bg-surface-container/50 hover:border-primary/20 transition-all cursor-pointer">
                <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span class="material-symbols-outlined text-primary text-xl">${item.icon}</span>
                </div>
                <div class="flex-1">
                  <p class="text-sm font-bold text-on-surface">${item.label}</p>
                  <p class="text-[10px] text-on-surface-variant">${item.desc}</p>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- System Info -->
        <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
          <h4 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">System Info</h4>
          <div class="grid grid-cols-2 gap-2 text-[10px] text-on-surface-variant">
            <span>Platform: FitLife v1.0.0</span>
            <span>Backend: Supabase</span>
            <span>AI: Google Gemini 2.0 Flash</span>
            <span>Auth: Supabase Auth</span>
          </div>
          <p class="text-[10px] text-on-surface-variant/40 mt-2">
            Note: Admin data access depends on Supabase RLS policies. Some queries may return limited data with the anon key.
          </p>
        </div>
      </div>
    </div>`;
}

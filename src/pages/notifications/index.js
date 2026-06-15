/**
 * FitLife Notifications Page
 * Shows meal reminders, streak alerts, plan updates, and system notifications.
 * 
 * NOTE: Currently uses static placeholder data.
 * TODO: Integrate with Supabase notifications table when backend is ready.
 */
import { renderPageHeader } from '../../components/page-header.js';

const NOTIFICATION_GROUPS = [
  {
    label: 'Today',
    items: [
      { icon: 'restaurant', color: 'primary', title: 'Lunch Reminder', body: 'Time to log your lunch! Stay on track with your nutrition goals.', time: '12:30 PM', unread: true },
      { icon: 'auto_awesome', color: 'secondary', title: 'AI Plan Updated', body: 'Your meal plan has been refreshed based on your recent activity.', time: '8:00 AM', unread: true },
      { icon: 'local_fire_department', color: 'tertiary', title: 'Streak Alert!', body: "Don't forget to log meals today to keep your streak alive!", time: '7:00 AM', unread: false },
    ]
  },
  {
    label: 'Yesterday',
    items: [
      { icon: 'emoji_events', color: 'secondary', title: 'Weekly Goal Reached!', body: 'You hit your protein target 5 out of 7 days. Great consistency!', time: '9:00 PM', unread: false },
      { icon: 'tips_and_updates', color: 'primary', title: 'New Feature: AI Vision', body: 'Snap a photo of your meal and let AI analyze the nutrition content.', time: '3:00 PM', unread: false },
    ]
  },
  {
    label: 'This Week',
    items: [
      { icon: 'workspace_premium', color: 'secondary', title: 'Try Premium Free', body: 'Unlock unlimited AI meal plans, advanced analytics, and more.', time: 'Mon', unread: false },
      { icon: 'monitoring', color: 'primary', title: 'Progress Report Ready', body: 'Your weekly nutrition and progress report is ready to view.', time: 'Sun', unread: false },
    ]
  }
];

function setupNotificationHandlers() {
  window._markAllRead = () => {
    document.querySelectorAll('[class*="border-primary/10"]').forEach(el => {
      el.className = el.className.replace('bg-surface-container-low/70 border border-primary/10', 'bg-surface-container-low/30 border border-outline-variant/5');
    });
    // Remove unread dots
    document.querySelectorAll('.w-2.h-2.rounded-full.bg-primary').forEach(dot => dot.remove());
    // Update unread badge
    const badge = document.querySelector('[class*="bg-primary/5"]');
    if (badge) badge.remove();
  };
}

export function renderNotifications() {
  const totalUnread = NOTIFICATION_GROUPS.reduce((acc, g) => acc + g.items.filter(n => n.unread).length, 0);
  setTimeout(setupNotificationHandlers, 50);

  return `
    <div class="min-h-screen bg-surface text-on-surface pb-8 pl-safe pr-safe">
      ${renderPageHeader({ 
        title: 'Notifications', 
        showBack: true,
        rightAction: totalUnread > 0 ? `
          <button onclick="window._markAllRead && window._markAllRead()" class="text-xs text-primary font-semibold px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">
            Mark All Read
          </button>` : ''
      })}

      <div class="px-5 py-5 space-y-6">
        <!-- Unread Badge -->
        ${totalUnread > 0 ? `
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <span class="text-[10px] font-bold text-on-primary">${totalUnread}</span>
            </div>
            <span class="text-xs text-primary font-medium">${totalUnread} unread notification${totalUnread > 1 ? 's' : ''}</span>
          </div>
        ` : ''}

        <!-- Notification Preferences -->
        <div class="p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/5 flex items-center gap-3">
          <span class="material-symbols-outlined text-on-surface-variant text-lg">tune</span>
          <span class="text-xs text-on-surface-variant flex-1">Manage notification preferences</span>
          <button onclick="window.location.hash='/profile'" class="text-xs text-primary font-semibold">Settings</button>
        </div>

        <!-- Notification Groups -->
        ${NOTIFICATION_GROUPS.map(group => `
          <div>
            <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">${group.label}</h3>
            <div class="space-y-2">
              ${group.items.map(n => `
                <div class="flex gap-3 p-3 rounded-xl ${n.unread ? 'bg-surface-container-low/70 border border-primary/10' : 'bg-surface-container-low/30 border border-outline-variant/5'} transition-all">
                  <div class="w-10 h-10 rounded-lg bg-${n.color}/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span class="material-symbols-outlined text-${n.color} text-lg" style="${n.unread ? 'font-variation-settings: \"FILL\" 1;' : ''}">${n.icon}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <p class="text-sm ${n.unread ? 'font-bold text-on-surface' : 'font-semibold text-on-surface/80'} truncate">${n.title}</p>
                      ${n.unread ? '<div class="w-2 h-2 rounded-full bg-primary flex-shrink-0"></div>' : ''}
                    </div>
                    <p class="text-xs text-on-surface-variant line-clamp-2">${n.body}</p>
                    <p class="text-[10px] text-on-surface-variant/60 mt-1">${n.time}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}

        <!-- Empty State -->
        <div class="text-center py-4">
          <p class="text-xs text-on-surface-variant/40">That's all your notifications</p>
        </div>
      </div>
    </div>`;
}

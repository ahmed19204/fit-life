/**
 * FitLife Bottom Navigation Bar
 * Premium mobile-first navigation matching Stitch UI design.
 */
import { navigate, getCurrentRoute } from '../services/router.js';

const NAV_ITEMS = [
  { path: '/dashboard', icon: 'home', label: 'Home' },
  { path: '/meals', icon: 'restaurant', label: 'Meals' },
  { path: '/progress', icon: 'monitoring', label: 'Progress' },
  { path: '/assistant', icon: 'smart_toy', label: 'AI Coach' },
  { path: '/profile', icon: 'person', label: 'Profile' },
];

export function renderNavBar() {
  const current = getCurrentRoute();
  return `
    <nav id="bottomNav" class="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant/20" 
         style="background: rgba(14, 21, 14, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
      <div class="flex items-center justify-around max-w-lg mx-auto px-2 py-2 pb-safe">
        ${NAV_ITEMS.map(item => {
          const active = current === item.path || (item.path !== '/dashboard' && current?.startsWith(item.path));
          return `
            <button onclick="window.location.hash='${item.path}'" 
                    class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[56px]
                           ${active ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}">
              <span class="material-symbols-outlined text-[22px] ${active ? 'font-bold' : ''}" 
                    style="${active ? 'font-variation-settings: \"FILL\" 1;' : ''}">${item.icon}</span>
              <span class="text-[10px] font-medium leading-tight">${item.label}</span>
              ${active ? '<div class="w-4 h-0.5 rounded-full bg-primary mt-0.5"></div>' : ''}
            </button>`;
        }).join('')}
      </div>
    </nav>`;
}

export function isNavRoute(path) {
  return NAV_ITEMS.some(item => path === item.path || (item.path !== '/dashboard' && path?.startsWith(item.path)));
}

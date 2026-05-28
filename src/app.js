/**
 * FitLife App - Main Entry Point
 * SPA Router setup, auth guards, and page registration.
 */
import { setContainer, registerRoutes, setBeforeEach, start, navigate } from './services/router.js';
import { isLoggedIn, onAuthStateChange, setupSessionRefresh } from './services/auth.js';
import { checkOnboardingCompleted } from './services/ai.js';
import { checkDayChange } from './services/meals.js';

// Page imports
import { renderSplash } from './pages/splash/index.js';
import { renderLanding } from './pages/landing/index.js';
import { renderAuth } from './pages/auth/index.js';
import { renderWelcome } from './pages/welcome/index.js';
import { renderOnboarding } from './pages/onboarding/index.js';
import { renderPlan } from './pages/plan/index.js';
import { renderDashboard } from './pages/dashboard/index.js';
import { renderMeals } from './pages/meals/index.js';
import { renderHistory } from './pages/history/index.js';
import { renderProgress } from './pages/progress/index.js';
import { renderProfile } from './pages/profile/index.js';
import { renderAssistant } from './pages/assistant/index.js';
import { renderAdmin } from './pages/admin/index.js';

// Additional page imports
import { renderDailyMeals } from './pages/daily-meals/index.js';
import { renderRecipe } from './pages/recipe/index.js';
import { renderNotifications } from './pages/notifications/index.js';
import { renderStreaks } from './pages/streaks/index.js';
import { renderPremium } from './pages/premium/index.js';
import { renderTraining } from './pages/training/index.js';

// Public routes that don't need auth
const PUBLIC_ROUTES = ['/', '/landing', '/auth'];

// Routes that need auth but NOT onboarding
const AUTH_NO_ONBOARDING = ['/welcome', '/onboarding', '/plan'];

async function init() {
  const app = document.getElementById('app');
  if (!app) return;

  setContainer(app);

  // Register all routes
  registerRoutes({
    '/': renderSplash,
    '/landing': renderLanding,
    '/auth': renderAuth,
    '/welcome': renderWelcome,
    '/onboarding': renderOnboarding,
    '/plan': renderPlan,
    '/dashboard': renderDashboard,
    '/meals': renderMeals,
    '/daily-meals': renderDailyMeals,
    '/recipe': renderRecipe,
    '/progress': renderProgress,
    '/history': renderHistory,
    '/profile': renderProfile,
    '/assistant': renderAssistant,
    '/notifications': renderNotifications,
    '/streaks': renderStreaks,
    '/premium': renderPremium,
    '/training': renderTraining,
    '/admin': renderAdmin,
    '*': () => `
      <div class="min-h-screen bg-surface flex items-center justify-center text-center px-6">
        <div>
          <span class="material-symbols-outlined text-primary text-5xl mb-4 block">explore_off</span>
          <h2 class="text-2xl font-bold text-on-surface mb-2">Page Not Found</h2>
          <p class="text-sm text-on-surface-variant mb-6">The page you're looking for doesn't exist.</p>
          <button onclick="window.location.hash='/dashboard'" class="px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-bold text-sm">Go to Dashboard</button>
        </div>
      </div>`,
  });

  // Auth guard
  setBeforeEach(async (to) => {
    if (PUBLIC_ROUTES.includes(to)) return true;

    const loggedIn = await isLoggedIn();
    if (!loggedIn) return '/auth';

    // Skip onboarding check for auth-setup routes
    if (AUTH_NO_ONBOARDING.includes(to)) return true;

    // Check onboarding for app routes
    try {
      const onboarding = await checkOnboardingCompleted();
      if (!onboarding.data?.completed) return '/welcome';
    } catch {
      // If check fails, allow navigation
    }

    return true;
  });

  // Listen for auth state changes
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      navigate('/landing');
    }
    // Handle OAuth callback — user signed in via Google redirect
    if (event === 'SIGNED_IN' && session) {
      const hash = window.location.hash.slice(1) || '/';
      // If on root or landing after OAuth redirect, go to dashboard
      if (hash === '/' || hash === '/landing' || hash === '/auth') {
        checkOnboardingCompleted().then(onboarding => {
          if (onboarding.data?.completed) {
            navigate('/dashboard');
          } else {
            navigate('/welcome');
          }
        }).catch(() => navigate('/dashboard'));
      }
    }
  });

  // Setup session refresh on tab reactivation
  setupSessionRefresh();
  
  // Check for day change on tab visibility (daily reset)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (checkDayChange()) {
        // Day changed — re-render current page to refresh daily data
        const currentHash = window.location.hash.slice(1) || '/';
        if (currentHash === '/dashboard') {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }
    }
  });

  // Check if user is already logged in on initial load
  const hash = window.location.hash.slice(1) || '/';
  if (hash === '/') {
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      const onboarding = await checkOnboardingCompleted();
      if (onboarding.data?.completed) {
        window.location.hash = '/dashboard';
      } else {
        window.location.hash = '/welcome';
      }
      return;
    }
  }

  // Start the router
  start();
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

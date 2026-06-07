```js
/**
 * FitLife App — Main Entry (Production Hardened)
 * ----------------------------------------------------------------------------
 *  - SPA Router setup with auth guards
 *  - Global error boundary
 *  - Online/offline notifications
 *  - Auth race-condition safety
 *  - Day-change auto-refresh
 *  - Production-safe logging
 *  - Stable startup flow
 */

import { setContainer, registerRoutes, setBeforeEach, start, navigate } from './services/router.js';
import { isLoggedIn, onAuthStateChange, setupSessionRefresh } from './services/auth.js';
import { checkOnboardingCompleted } from './services/ai.js';
import { checkDayChange } from './services/meals.js';
import { toast, notifyOnline, notifyOffline } from './services/toast.js';
import { logger } from './utils/logger.js';

// Pages
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
import { renderDailyMeals } from './pages/daily-meals/index.js';
import { renderRecipe } from './pages/recipe/index.js';
import { renderNotifications } from './pages/notifications/index.js';
import { renderStreaks } from './pages/streaks/index.js';
import { renderPremium } from './pages/premium/index.js';
import { renderTraining } from './pages/training/index.js';

const log = logger.scoped('App');

const PUBLIC_ROUTES = ['/', '/landing', '/auth'];
const AUTH_NO_ONBOARDING = ['/welcome', '/onboarding', '/plan'];

let lastSignInHandled = 0;

function escapeHtml(str) {
  return String(str).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderGlobalError(message = 'Something went wrong') {
  return `
    <div class="min-h-screen bg-surface flex items-center justify-center px-6 text-center" style="min-height:100dvh;">
      <div class="max-w-sm">
        <div class="w-16 h-16 rounded-2xl bg-error/15 border border-error/20 flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-error text-3xl" style="font-variation-settings:'FILL' 1;">
            error
          </span>
        </div>

        <h2 class="text-2xl font-bold text-on-surface mb-2">
          Unexpected error
        </h2>

        <p class="text-sm text-on-surface-variant mb-6">
          ${escapeHtml(message)}
        </p>

        <div class="flex justify-center gap-3 flex-wrap">
          <button
            onclick="window.location.reload()"
            class="px-5 py-3 min-h-[44px] rounded-full bg-primary-container text-on-primary-container font-bold text-sm"
          >
            Reload
          </button>

          <button
            onclick="window.location.hash='/dashboard'"
            class="px-5 py-3 min-h-[44px] rounded-full border border-outline-variant/20 text-on-surface font-bold text-sm"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderNotFound() {
  return `
    <div class="min-h-screen bg-surface flex items-center justify-center text-center px-6" style="min-height:100dvh;">
      <div class="max-w-sm">

        <div class="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-primary text-3xl">
            explore_off
          </span>
        </div>

        <h2 class="text-2xl font-bold text-on-surface mb-2">
          Page Not Found
        </h2>

        <p class="text-sm text-on-surface-variant mb-6">
          The page you're looking for doesn't exist.
        </p>

        <button
          onclick="window.location.hash='/dashboard'"
          class="px-6 py-3 min-h-[44px] rounded-full bg-primary-container text-on-primary-container font-bold text-sm"
        >
          Go to Dashboard
        </button>

      </div>
    </div>
  `;
}

async function init() {
  const app = document.getElementById('app');

  if (!app) {
    console.error('[App] #app container not found');
    return;
  }

  setContainer(app);

  // Routes
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
    '*': renderNotFound,
  });

  // Route protection
  setBeforeEach(async (to) => {
    if (PUBLIC_ROUTES.includes(to)) {
      return true;
    }

    const loggedIn = await isLoggedIn();

    if (!loggedIn) {
      return '/auth';
    }

    if (AUTH_NO_ONBOARDING.includes(to)) {
      return true;
    }

    try {
      const onboarding = await checkOnboardingCompleted();

      if (!onboarding.data?.completed) {
        return '/welcome';
      }
    } catch (e) {
      log.warn('Onboarding check failed', e?.message);
    }

    return true;
  });

  // Auth listener
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      navigate('/landing');
      return;
    }

    if (event === 'SIGNED_IN' && session) {
      const now = Date.now();

      // Prevent duplicate redirects
      if (now - lastSignInHandled < 1500) {
        return;
      }

      lastSignInHandled = now;

      const hash = window.location.hash.slice(1) || '/';

      if (
        hash === '/' ||
        hash === '/landing' ||
        hash === '/auth' ||
        hash.startsWith('/auth?')
      ) {
        checkOnboardingCompleted()
          .then((onboarding) => {
            navigate(
              onboarding.data?.completed
                ? '/dashboard'
                : '/welcome'
            );
          })
          .catch(() => {
            navigate('/dashboard');
          });
      }
    }

    if (event === 'TOKEN_REFRESHED') {
      log.debug('Session refreshed');
    }
  });

  // Session refresh
  setupSessionRefresh();

  // Day refresh
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      checkDayChange()
    ) {
      const currentHash = window.location.hash.slice(1) || '/';

      if (currentHash === '/dashboard') {
        window.dispatchEvent(
          new HashChangeEvent('hashchange')
        );
      }
    }
  });

  // Online / Offline
  window.addEventListener('online', () => {
    notifyOnline();
  });

  window.addEventListener('offline', () => {
    notifyOffline();
  });

  // Global error handling
  window.addEventListener('error', (event) => {
    const msg =
      event?.error?.message ||
      event?.message ||
      'Unknown error';

    log.error('Window error:', msg);

    if (event?.error) {
      toast.error('Something went wrong.');
    }
  });

  // Promise rejection handling
  window.addEventListener('unhandledrejection', (event) => {
    const msg =
      event?.reason?.message ||
      String(event?.reason || 'Unknown');

    log.error('Unhandled rejection:', msg);

    // Ignore common harmless errors
    if (
      /aborted|cancelled|AbortError|NetworkError/i.test(msg)
    ) {
      return;
    }

    toast.error('Request failed. Please try again.');

    event.preventDefault();
  });

  // Initial smart redirect
  const hash = window.location.hash.slice(1) || '/';

  if (hash === '/') {
    try {
      const loggedIn = await isLoggedIn();

      if (loggedIn) {
        const onboarding =
          await checkOnboardingCompleted();

        window.location.hash =
          onboarding.data?.completed
            ? '/dashboard'
            : '/welcome';

        return;
      }
    } catch (e) {
      log.warn(
        'Initial auth boot failed',
        e?.message
      );
    }
  }

  // Start app
  try {
    start();
  } catch (e) {
    log.error(
      'Router failed to initialize',
      e?.message
    );

    app.innerHTML = renderGlobalError(
      e?.message || 'Router failed to initialize'
    );
  }
}

// Boot app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

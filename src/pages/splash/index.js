/**
 * FitLife Splash Screen
 * Quick branded splash shown only briefly before routing the user
 * to landing / dashboard depending on auth state. Handled mostly by app.js
 * boot, so this is a graceful fallback if it ever does render.
 */
import { isLoggedIn } from '../../services/auth.js';
import { checkOnboardingCompleted } from '../../services/ai.js';
import { navigate } from '../../services/router.js';

export function renderSplash() {
  // Decide destination on next tick, after returning HTML
  setTimeout(async () => {
    try {
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        navigate('/landing');
        return;
      }
      const onboarding = await checkOnboardingCompleted();
      navigate(onboarding.data?.completed ? '/dashboard' : '/welcome');
    } catch {
      navigate('/landing');
    }
  }, 50);

  return `
    <div class="min-h-screen bg-surface flex items-center justify-center px-6 pl-safe pr-safe pt-safe pb-safe" style="min-height:100dvh;">
      <div class="flex flex-col items-center gap-5 text-center animate-fade-in">
        <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-container to-primary flex items-center justify-center"
             style="box-shadow:0 0 60px rgba(34,197,94,0.3);">
          <span class="material-symbols-outlined text-on-primary text-4xl"
                style="font-variation-settings: 'FILL' 1;">fitness_center</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold text-on-surface">Fit<span class="text-primary">Life</span></h1>
          <p class="text-xs text-on-surface-variant mt-1 tracking-wider uppercase">AI-Powered Performance</p>
        </div>
        <div class="flex gap-1.5 mt-2" aria-hidden="true">
          <div class="w-1.5 h-1.5 rounded-full bg-primary fl-boot-dot" style="animation-delay:0ms"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary fl-boot-dot" style="animation-delay:140ms"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary fl-boot-dot" style="animation-delay:280ms"></div>
        </div>
        <p class="sr-only">Loading FitLife...</p>
      </div>
    </div>`;
}

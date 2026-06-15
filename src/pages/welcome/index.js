/**
 * FitLife Welcome Screen
 * Post-signup welcome with transition to onboarding.
 */
import { getCurrentUser, getDisplayName } from '../../services/auth.js';

export async function renderWelcome() {
  const res = await getCurrentUser();
  const name = res.success ? getDisplayName(res.data.user) : 'Champion';
  const firstName = name.split(' ')[0];

  setTimeout(() => {
    // Auto-advance after 4 seconds
    const autoTimer = setTimeout(() => {
      window.location.hash = '/onboarding';
    }, 6000);
    
    const btn = document.getElementById('welcomeStartBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        clearTimeout(autoTimer);
        window.location.hash = '/onboarding';
      });
    }
  }, 50);

  return `
    <div class="min-h-screen bg-surface flex flex-col items-center justify-center px-6 pl-safe pr-safe pt-safe pb-safe relative overflow-hidden">
      <!-- Ambient effects -->
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.08]"
             style="background: radial-gradient(circle, #22c55e 0%, transparent 70%);"></div>
        <div class="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-[0.04]"
             style="background: radial-gradient(circle, #9ddf2e 0%, transparent 70%);"></div>
      </div>

      <div class="relative z-10 text-center max-w-md animate-fade-in">
        <!-- Welcome Icon -->
        <div class="mb-8 inline-flex">
          <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary-container/30 flex items-center justify-center border border-primary/20"
               style="box-shadow: 0 0 50px rgba(34, 197, 94, 0.15);">
            <span class="material-symbols-outlined text-primary text-4xl" style="font-variation-settings: 'FILL' 1;">waving_hand</span>
          </div>
        </div>

        <!-- Welcome Text -->
        <h1 class="text-3xl font-bold text-on-surface mb-3">
          Welcome, <span class="text-primary">${firstName}</span>!
        </h1>
        <p class="text-on-surface-variant text-base leading-relaxed mb-3">
          You're about to unlock your personalized AI-powered fitness and nutrition ecosystem.
        </p>
        <p class="text-on-surface-variant/70 text-sm mb-10">
          We'll ask a few quick questions to craft your perfect plan.
        </p>

        <!-- Steps Preview -->
        <div class="flex items-center justify-center gap-3 mb-10">
          ${['Personal Info', 'Diet Preferences', 'Activity Level', 'Health Goals', 'AI Plan'].map((step, i) => `
            <div class="flex flex-col items-center gap-1.5">
              <div class="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/20 flex items-center justify-center text-xs font-bold text-on-surface-variant">${i + 1}</div>
              <span class="text-[9px] text-on-surface-variant/60 leading-tight max-w-[50px] text-center">${step}</span>
            </div>
            ${i < 4 ? '<div class="w-4 h-px bg-outline-variant/20 mt-[-12px]"></div>' : ''}
          `).join('')}
        </div>

        <!-- CTA -->
        <button id="welcomeStartBtn"
                class="px-10 py-4 rounded-full bg-primary-container text-on-primary-container font-bold text-base hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-[0.98]">
          Let's Begin
          <span class="material-symbols-outlined text-lg align-middle ml-1">arrow_forward</span>
        </button>

        <p class="text-xs text-on-surface-variant/50 mt-6">Takes about 2 minutes</p>
      </div>

      <style>
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.6s ease-out forwards; }
      </style>
    </div>`;
}

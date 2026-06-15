/**
 * FitLife Premium Membership Page
 * Premium plan comparison, feature showcase, and subscription management.
 */
import { renderPageHeader } from '../../components/page-header.js';

const FREE_FEATURES = [
  'Basic meal logging',
  '1 AI meal plan per week',
  'Manual nutrition tracking',
  'Basic progress view',
  'Community access',
];

const PREMIUM_FEATURES = [
  { icon: 'auto_awesome', text: 'Unlimited AI meal plans', highlight: true },
  { icon: 'photo_camera', text: 'AI Vision meal scanning', highlight: true },
  { icon: 'smart_toy', text: 'Personal AI nutrition coach', highlight: true },
  { icon: 'restaurant_menu', text: 'AI recipe generator', highlight: false },
  { icon: 'monitoring', text: 'Advanced analytics & insights', highlight: false },
  { icon: 'calendar_month', text: 'Detailed meal scheduling', highlight: false },
  { icon: 'share', text: 'Export reports & data', highlight: false },
  { icon: 'notifications_active', text: 'Smart meal reminders', highlight: false },
  { icon: 'group', text: 'Priority support', highlight: false },
  { icon: 'verified', text: 'Ad-free experience', highlight: false },
];

const PLANS = [
  { name: 'Monthly', price: '$9.99', period: '/month', popular: false, save: '' },
  { name: 'Yearly', price: '$59.99', period: '/year', popular: true, save: 'Save 50%' },
  { name: 'Lifetime', price: '$149.99', period: 'one-time', popular: false, save: 'Best Value' },
];

function setupPremiumHandlers() {
  window._selectPlan = (planName) => {
    // Highlight selected plan
    document.querySelectorAll('[onclick*="_selectPlan"]').forEach(btn => {
      btn.classList.remove('border-primary', 'bg-primary/5');
      btn.classList.add('border-outline-variant/10', 'bg-surface-container-low/30');
    });
    const selected = [...document.querySelectorAll('[onclick*="_selectPlan"]')].find(btn =>
      btn.getAttribute('onclick')?.includes(planName)
    );
    if (selected) {
      selected.classList.remove('border-outline-variant/10', 'bg-surface-container-low/30');
      selected.classList.add('border-primary', 'bg-primary/5');
    }
  };

  window._startTrial = () => {
    const btn = document.querySelector('[onclick*="_startTrial"]');
    if (btn) {
      btn.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Coming Soon...</span>';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = 'Start 7-Day Free Trial';
        btn.disabled = false;
      }, 2000);
    }
  };
}

export function renderPremium() {
  setTimeout(setupPremiumHandlers, 50);
  return `
    <div class="min-h-screen bg-surface text-on-surface pb-8 pl-safe pr-safe">
      ${renderPageHeader({ title: 'Premium', showBack: true })}

      <div class="px-5 py-5 space-y-6">
        <!-- Hero -->
        <div class="text-center py-4 relative">
          <div class="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-3xl pointer-events-none"></div>
          <div class="relative">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/20 flex items-center justify-center mx-auto mb-3 border border-primary/30"
                 style="box-shadow: 0 0 60px rgba(34,197,94,0.2);">
              <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
            </div>
            <h2 class="text-2xl font-extrabold mb-1">
              <span class="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">Upgrade to Premium</span>
            </h2>
            <p class="text-sm text-on-surface-variant max-w-xs mx-auto">Unlock the full power of AI-driven nutrition and fitness.</p>
          </div>
        </div>

        <!-- Feature Comparison -->
        <div class="space-y-3">
          <!-- Free Tier -->
          <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
            <div class="flex items-center gap-2 mb-3">
              <span class="material-symbols-outlined text-on-surface-variant text-lg">person</span>
              <h3 class="text-sm font-bold text-on-surface">Free Plan</h3>
              <span class="ml-auto px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[10px]">Current</span>
            </div>
            <div class="space-y-2">
              ${FREE_FEATURES.map(f => `
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-on-surface-variant text-sm">check_circle</span>
                  <span class="text-xs text-on-surface-variant">${f}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Premium Tier -->
          <div class="p-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
            <div class="absolute top-0 right-0 px-3 py-1 rounded-bl-lg bg-primary text-on-primary text-[10px] font-bold">PRO</div>
            <div class="flex items-center gap-2 mb-3">
              <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
              <h3 class="text-sm font-bold text-primary">Premium Plan</h3>
            </div>
            <div class="space-y-2">
              ${PREMIUM_FEATURES.map(f => `
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">check_circle</span>
                  <span class="text-xs ${f.highlight ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}">${f.text}</span>
                  ${f.highlight ? '<span class="ml-auto px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold">NEW</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Pricing Plans -->
        <div>
          <h3 class="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3 text-center">Choose Your Plan</h3>
          <div class="space-y-3">
            ${PLANS.map(plan => `
              <button class="w-full p-4 rounded-xl border ${plan.popular ? 'border-primary bg-primary/5' : 'border-outline-variant/10 bg-surface-container-low/30'} hover:border-primary/40 transition-all text-left relative"
                      onclick="window._selectPlan && window._selectPlan('${plan.name}')">
                ${plan.popular ? '<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">MOST POPULAR</div>' : ''}
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-bold text-on-surface">${plan.name}</p>
                    ${plan.save ? `<span class="text-[10px] text-primary font-semibold">${plan.save}</span>` : ''}
                  </div>
                  <div class="text-right">
                    <span class="text-xl font-extrabold text-on-surface">${plan.price}</span>
                    <span class="text-[10px] text-on-surface-variant">${plan.period}</span>
                  </div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- CTA -->
        <button onclick="window._startTrial && window._startTrial()"
                class="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all">
          Start 7-Day Free Trial
        </button>

        <p class="text-center text-[10px] text-on-surface-variant/60">
          Cancel anytime. No commitment. Your data stays yours.
        </p>

        <!-- Testimonial -->
        <div class="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
          <div class="flex items-center gap-1 mb-2">
            ${[1,2,3,4,5].map(() => '<span class="material-symbols-outlined text-yellow-400 text-sm" style="font-variation-settings: \'FILL\' 1;">star</span>').join('')}
          </div>
          <p class="text-xs text-on-surface-variant italic">"FitLife Premium transformed my nutrition. The AI plans are incredibly accurate and the meal scanning saves so much time."</p>
          <p class="text-[10px] text-on-surface-variant/60 mt-2">— Sarah K., Premium member since 2024</p>
        </div>
      </div>
    </div>`;
}

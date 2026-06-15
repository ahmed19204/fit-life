/**
 * FitLife Authentication Page (Phase 5 — Premium Auth UX)
 * ----------------------------------------------------------------------------
 * Views:  login | signup | verify (6-digit OTP)
 *  - Google OAuth via Supabase
 *  - Email signup with rich error & loading states
 *  - 6-box OTP input with paste-support, auto-focus, resend timer
 *  - Uses global toast + loading services (Phase 3)
 */
import { registerUser, loginUser, signInWithGoogle, verifyEmailOtp, resendVerificationOtp } from '../../services/auth.js';
import { getPasswordStrength } from '../../utils/validation.js';
import { navigate, getQueryParams } from '../../services/router.js';
import { toast } from '../../services/toast.js';
import { withLoading } from '../../services/loading.js';

let currentView = 'login';
let pendingEmail = ''; // email being verified after signup
let resendCountdown = 0;
let resendTimer = null;

function escapeAttr(s) { return String(s).replace(/[<>"'&]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'})[c]); }

export function renderAuth() {
  const params = getQueryParams();
  if (params.view === 'verify' && params.email) {
    currentView = 'verify';
    pendingEmail = params.email;
  } else if (params.view === 'signup') {
    currentView = 'signup';
  } else {
    currentView = 'login';
  }

  setTimeout(() => initAuthPage(), 50);

  return `
    <div data-loading-scope class="min-h-screen bg-surface flex flex-col items-center justify-center px-5 pl-safe pr-safe pt-safe pb-safe py-8 relative overflow-hidden">
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
             style="background: radial-gradient(circle, #22c55e 0%, transparent 70%);"></div>
      </div>

      <div class="relative z-10 w-full max-w-sm">
        <div class="flex flex-col items-center mb-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-container to-primary flex items-center justify-center mb-4"
               style="box-shadow: 0 0 40px rgba(34, 197, 94, 0.2);">
            <span class="material-symbols-outlined text-on-primary text-3xl" style="font-variation-settings: 'FILL' 1;">fitness_center</span>
          </div>
          <h1 class="text-2xl font-bold text-on-surface">Fit<span class="text-primary">Life</span></h1>
          <p class="text-sm text-on-surface-variant mt-1">Your AI-Powered Performance Partner</p>
        </div>

        ${currentView === 'verify' ? renderVerifyView() : renderLoginSignupView()}

        <div class="mt-8 text-center">
          <button type="button" onclick="window.location.hash='/landing'" class="text-sm text-on-surface-variant hover:text-primary transition-colors min-h-[44px] px-3 inline-flex items-center">
            <span class="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span>
            Back to home
          </button>
        </div>
      </div>
    </div>`;
}

function renderLoginSignupView() {
  return `
    <div class="flex bg-surface-container-low rounded-full p-1 mb-6 border border-outline-variant/10" role="tablist" aria-label="Authentication mode">
      <button id="loginTab" type="button" role="tab" aria-selected="${currentView === 'login'}" onclick="window._switchAuthView('login')"
              class="flex-1 py-2.5 rounded-full text-sm font-semibold transition-all text-center min-h-[44px] ${currentView === 'login' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}">
        Sign In
      </button>
      <button id="signupTab" type="button" role="tab" aria-selected="${currentView === 'signup'}" onclick="window._switchAuthView('signup')"
              class="flex-1 py-2.5 rounded-full text-sm font-semibold transition-all text-center min-h-[44px] ${currentView === 'signup' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}">
        Create Account
      </button>
    </div>

    <form id="loginForm" class="${currentView === 'login' ? '' : 'hidden'}" onsubmit="window._handleLogin(event)" novalidate>
      <div class="space-y-4">
        <div>
          <label for="loginEmail" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Email</label>
          <input id="loginEmail" name="email" type="email" required autocomplete="email" inputmode="email"
                 class="w-full px-4 py-3 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                 placeholder="your@email.com">
        </div>
        <div>
          <label for="loginPassword" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Password</label>
          <div class="relative">
            <input id="loginPassword" name="password" type="password" required autocomplete="current-password"
                   class="w-full px-4 py-3 pr-11 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                   placeholder="Enter password">
            <button type="button" aria-label="Show/hide password" onclick="window._togglePassword('loginPassword', this)"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span class="material-symbols-outlined text-lg">visibility_off</span>
            </button>
          </div>
        </div>
      </div>
      <p id="loginError" class="text-xs text-error mt-3 hidden text-center" role="alert"></p>
      <button id="loginBtn" type="submit" data-loading-bind
              class="w-full mt-6 py-3.5 min-h-[44px] rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <span>Sign In</span>
      </button>
    </form>

    <form id="signupForm" class="${currentView === 'signup' ? '' : 'hidden'}" onsubmit="window._handleSignup(event)" novalidate>
      <div class="space-y-4">
        <div>
          <label for="signupName" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Full Name</label>
          <input id="signupName" type="text" required autocomplete="name"
                 class="w-full px-4 py-3 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                 placeholder="Your full name">
        </div>
        <div>
          <label for="signupEmail" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Email</label>
          <input id="signupEmail" type="email" required autocomplete="email" inputmode="email"
                 class="w-full px-4 py-3 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                 placeholder="your@email.com">
        </div>
        <div>
          <label for="signupPassword" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Password</label>
          <div class="relative">
            <input id="signupPassword" type="password" required autocomplete="new-password"
                   oninput="window._updateStrength(this.value)"
                   class="w-full px-4 py-3 pr-11 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                   placeholder="Min. 6 characters">
            <button type="button" aria-label="Show/hide password" onclick="window._togglePassword('signupPassword', this)"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span class="material-symbols-outlined text-lg">visibility_off</span>
            </button>
          </div>
          <div id="strengthWrap" class="mt-2 hidden">
            <div class="h-1 rounded-full bg-surface-container-highest overflow-hidden"><div id="strengthBar" class="h-full rounded-full transition-all duration-300" style="width: 0%;"></div></div>
            <p id="strengthLabel" class="text-xs mt-1 font-medium"></p>
          </div>
        </div>
        <div>
          <label for="signupConfirm" class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Confirm Password</label>
          <input id="signupConfirm" type="password" required autocomplete="new-password"
                 class="w-full px-4 py-3 min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                 placeholder="Confirm password">
        </div>
      </div>
      <p id="signupError" class="text-xs text-error mt-3 hidden text-center" role="alert"></p>
      <button id="signupBtn" type="submit" data-loading-bind
              class="w-full mt-6 py-3.5 min-h-[44px] rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <span>Create Account</span>
      </button>
    </form>

    <div class="flex items-center gap-4 my-6">
      <div class="flex-1 h-px bg-outline-variant/20"></div>
      <span class="text-xs text-on-surface-variant font-medium">or continue with</span>
      <div class="flex-1 h-px bg-outline-variant/20"></div>
    </div>

    <button type="button" onclick="window._handleGoogleAuth()"
            class="w-full py-3 min-h-[44px] rounded-full border border-outline-variant/20 text-on-surface font-semibold text-sm hover:bg-surface-container-high/50 transition-all flex items-center justify-center gap-3">
      <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span>Google</span>
    </button>
  `;
}

function renderVerifyView() {
  return `
    <div class="rounded-2xl p-6 bg-surface-container-low/60 border border-primary/15 backdrop-blur">
      <div class="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/15 border border-primary/30">
        <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings:'FILL' 1;">mark_email_read</span>
      </div>
      <h2 class="text-xl font-bold text-on-surface text-center mb-1">Verify your email</h2>
      <p class="text-sm text-on-surface-variant text-center mb-1">We sent a 6-digit code to</p>
      <p class="text-sm text-primary font-semibold text-center mb-5 break-all">${escapeAttr(pendingEmail)}</p>

      <form id="otpForm" onsubmit="window._handleOtpSubmit(event)" novalidate>
        <div class="flex justify-center gap-2 mb-4" dir="ltr">
          ${[0,1,2,3,4,5].map(i => `
            <input type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code"
                   id="otp${i}" data-otp-idx="${i}"
                   class="w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
          `).join('')}
        </div>
        <p id="otpError" class="text-xs text-error text-center mb-3 hidden" role="alert"></p>
        <button id="otpVerifyBtn" type="submit" data-loading-bind
                class="w-full py-3.5 min-h-[44px] rounded-full bg-primary-container text-on-primary-container font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
          Verify Email
        </button>
      </form>

      <div class="mt-4 text-center">
        <button id="resendBtn" type="button" onclick="window._handleResendOtp()"
                class="text-xs text-on-surface-variant hover:text-primary transition-colors min-h-[44px] px-3 inline-flex items-center">
          Didn't receive code? <span id="resendLabel" class="ml-1 font-semibold">Resend code</span>
        </button>
      </div>

      <div class="mt-2 text-center">
        <button type="button" onclick="window._switchAuthView('login')" class="text-xs text-on-surface-variant hover:text-on-surface transition-colors min-h-[44px] px-3 inline-flex items-center">
          <span class="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span>
          Use a different account
        </button>
      </div>
    </div>
  `;
}

function initAuthPage() {
  window._switchAuthView = (view) => {
    if (view === 'verify' && !pendingEmail) view = 'login';
    if (view === currentView) return;
    const url = new URL(window.location.href);
    url.hash = view === 'login' ? '/auth' : `/auth?view=${view}${view === 'verify' ? `&email=${encodeURIComponent(pendingEmail)}` : ''}`;
    window.location.hash = url.hash;
  };

  window._handleLogin = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    errorEl?.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Signing in...</span>';

    const result = await withLoading('auth-login', () => loginUser({ email, password }));

    if (result.success) {
      toast.success('Welcome back!');
      setTimeout(() => navigate('/dashboard'), 600);
    } else {
      if (result.data?.code === 'EMAIL_NOT_CONFIRMED') {
        pendingEmail = email;
        toast.warning('Please verify your email first');
        window.location.hash = `/auth?view=verify&email=${encodeURIComponent(email)}`;
      } else {
        errorEl.textContent = result.message;
        errorEl?.classList.remove('hidden');
        toast.error(result.message);
      }
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In</span>';
    }
  };

  window._handleSignup = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const errorEl = document.getElementById('signupError');
    const fullName = document.getElementById('signupName')?.value?.trim();
    const email = document.getElementById('signupEmail')?.value?.trim();
    const password = document.getElementById('signupPassword')?.value;
    const confirm = document.getElementById('signupConfirm')?.value;
    errorEl?.classList.add('hidden');
    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl?.classList.remove('hidden');
      toast.error('Passwords do not match.');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Creating account...</span>';

    const result = await withLoading('auth-signup', () => registerUser({ email, password, fullName }));

    if (result.success) {
      if (result.data.requiresEmailConfirmation) {
        pendingEmail = email;
        toast.success('Verification code sent to your email');
        window.location.hash = `/auth?view=verify&email=${encodeURIComponent(email)}`;
      } else {
        toast.success('Account created!');
        setTimeout(() => navigate('/welcome'), 600);
      }
    } else {
      errorEl.textContent = result.message;
      errorEl?.classList.remove('hidden');
      toast.error(result.message);
    }
    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span>';
  };

  window._handleGoogleAuth = async () => {
    const r = await signInWithGoogle();
    if (!r.success) toast.error(r.message || 'Google sign-in failed');
  };

  window._togglePassword = (inputId, btn) => {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (!input || !icon) return;
    if (input.type === 'password') { input.type = 'text'; icon.textContent = 'visibility'; }
    else { input.type = 'password'; icon.textContent = 'visibility_off'; }
  };

  window._updateStrength = (value) => {
    const wrap = document.getElementById('strengthWrap');
    const bar = document.getElementById('strengthBar');
    const label = document.getElementById('strengthLabel');
    if (!value) { wrap?.classList.add('hidden'); return; }
    wrap?.classList.remove('hidden');
    const strength = getPasswordStrength(value);
    bar.style.width = strength.pct + '%';
    bar.style.backgroundColor = strength.color;
    label.textContent = strength.label;
    label.style.color = strength.color;
  };

  // ── OTP view handlers ────────────────────────────────────────────────────
  if (currentView === 'verify') {
    setupOtpInputs();
    startResendTimer(60);
  }

  window._handleOtpSubmit = async (e) => {
    e.preventDefault();
    const code = readOtpValue();
    const errorEl = document.getElementById('otpError');
    errorEl?.classList.add('hidden');
    if (code.length !== 6) {
      errorEl.textContent = 'Enter the full 6-digit code.';
      errorEl?.classList.remove('hidden');
      return;
    }
    const btn = document.getElementById('otpVerifyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Verifying…</span>';
    const r = await withLoading('verify-otp', () => verifyEmailOtp({ email: pendingEmail, token: code }));
    if (r.success) {
      toast.success('Email verified!');
      setTimeout(() => navigate('/welcome'), 500);
    } else {
      errorEl.textContent = r.message || 'Invalid code';
      errorEl?.classList.remove('hidden');
      toast.error(r.message || 'Invalid code');
      btn.disabled = false;
      btn.innerHTML = 'Verify Email';
      // Clear inputs for retry
      for (let i = 0; i < 6; i++) {
        const inp = document.getElementById('otp' + i);
        if (inp) inp.value = '';
      }
      document.getElementById('otp0')?.focus();
    }
  };

  window._handleResendOtp = async () => {
    if (resendCountdown > 0) return;
    const r = await withLoading('resend-otp', () => resendVerificationOtp({ email: pendingEmail }));
    if (r.success) {
      toast.success('Code resent. Check your inbox.');
      startResendTimer(60);
    } else {
      toast.error(r.message || 'Could not resend');
    }
  };
}

function readOtpValue() {
  let out = '';
  for (let i = 0; i < 6; i++) {
    const v = document.getElementById('otp' + i)?.value || '';
    out += v.replace(/\D/g, '').slice(0, 1);
  }
  return out;
}

function setupOtpInputs() {
  const inputs = Array.from({ length: 6 }, (_, i) => document.getElementById('otp' + i));
  inputs[0]?.focus();
  inputs.forEach((inp, i) => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < 5) inputs[i + 1]?.focus();
      // Auto-submit on last digit
      if (i === 5 && inp.value && readOtpValue().length === 6) {
        document.getElementById('otpForm')?.requestSubmit?.();
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) {
        inputs[i - 1]?.focus();
        inputs[i - 1].value = '';
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft' && i > 0) { inputs[i - 1]?.focus(); e.preventDefault(); }
      if (e.key === 'ArrowRight' && i < 5) { inputs[i + 1]?.focus(); e.preventDefault(); }
    });
    inp.addEventListener('paste', (e) => {
      const data = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (!data) return;
      e.preventDefault();
      for (let j = 0; j < 6; j++) inputs[j].value = data[j] || '';
      inputs[Math.min(data.length, 5)]?.focus();
      if (data.length === 6) document.getElementById('otpForm')?.requestSubmit?.();
    });
  });
}

function startResendTimer(seconds) {
  resendCountdown = seconds;
  if (resendTimer) clearInterval(resendTimer);
  const label = document.getElementById('resendLabel');
  const btn = document.getElementById('resendBtn');
  if (label && btn) {
    btn.disabled = true;
    btn.classList.add('opacity-60');
    label.textContent = `Resend in ${resendCountdown}s`;
  }
  resendTimer = setInterval(() => {
    resendCountdown--;
    const lbl = document.getElementById('resendLabel');
    const b = document.getElementById('resendBtn');
    if (!lbl || !b) { clearInterval(resendTimer); resendTimer = null; return; }
    if (resendCountdown <= 0) {
      clearInterval(resendTimer); resendTimer = null;
      lbl.textContent = 'Resend code';
      b.disabled = false;
      b.classList.remove('opacity-60');
    } else {
      lbl.textContent = `Resend in ${resendCountdown}s`;
    }
  }, 1000);
}

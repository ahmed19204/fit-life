/**
 * FitLife Authentication Page
 * Login / Signup with Stitch Premium UI.
 * Integrated with Supabase auth service.
 */
import { registerUser, loginUser, signInWithGoogle } from '../../services/auth.js';
import { isValidEmail, getPasswordStrength, validateSignupField, validateLoginField } from '../../utils/validation.js';
import { navigate, getQueryParams } from '../../services/router.js';

let currentView = 'login';

export function renderAuth() {
  const params = getQueryParams();
  currentView = params.view === 'signup' ? 'signup' : 'login';

  setTimeout(() => initAuthPage(), 50);

  return `
    <div class="min-h-screen bg-surface flex flex-col items-center justify-center px-5 py-8 relative overflow-hidden">
      <!-- Background -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
             style="background: radial-gradient(circle, #22c55e 0%, transparent 70%);"></div>
      </div>

      <div class="relative z-10 w-full max-w-sm">
        <!-- Logo -->
        <div class="flex flex-col items-center mb-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-container to-primary flex items-center justify-center mb-4"
               style="box-shadow: 0 0 40px rgba(34, 197, 94, 0.2);">
            <span class="material-symbols-outlined text-on-primary text-3xl" style="font-variation-settings: 'FILL' 1;">fitness_center</span>
          </div>
          <h1 class="text-2xl font-bold text-on-surface">Fit<span class="text-primary">Life</span></h1>
          <p class="text-sm text-on-surface-variant mt-1">Your AI-Powered Performance Partner</p>
        </div>

        <!-- Tab Switch -->
        <div class="flex bg-surface-container-low rounded-full p-1 mb-6 border border-outline-variant/10">
          <button id="loginTab" onclick="switchAuthView('login')"
                  class="flex-1 py-2.5 rounded-full text-sm font-semibold transition-all text-center ${currentView === 'login' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}">
            Sign In
          </button>
          <button id="signupTab" onclick="switchAuthView('signup')"
                  class="flex-1 py-2.5 rounded-full text-sm font-semibold transition-all text-center ${currentView === 'signup' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}">
            Create Account
          </button>
        </div>

        <!-- Login Form -->
        <form id="loginForm" class="${currentView === 'login' ? '' : 'hidden'}" onsubmit="handleLogin(event)">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Email</label>
              <input id="loginEmail" type="email" required autocomplete="email"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                     placeholder="your@email.com">
              <p id="loginEmailError" class="text-xs text-error mt-1 hidden"></p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Password</label>
              <div class="relative">
                <input id="loginPassword" type="password" required autocomplete="current-password"
                       class="w-full px-4 py-3 pr-11 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                       placeholder="Enter password">
                <button type="button" onclick="togglePasswordVisibility('loginPassword', this)" 
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
                  <span class="material-symbols-outlined text-lg">visibility_off</span>
                </button>
              </div>
              <p id="loginPasswordError" class="text-xs text-error mt-1 hidden"></p>
            </div>
          </div>

          <p id="loginError" class="text-xs text-error mt-3 hidden text-center"></p>

          <button id="loginBtn" type="submit"
                  class="w-full mt-6 py-3.5 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <span>Sign In</span>
          </button>
        </form>

        <!-- Signup Form -->
        <form id="signupForm" class="${currentView === 'signup' ? '' : 'hidden'}" onsubmit="handleSignup(event)">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Full Name</label>
              <input id="signupName" type="text" required autocomplete="name"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                     placeholder="Your full name">
              <p id="signupNameError" class="text-xs text-error mt-1 hidden"></p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Email</label>
              <input id="signupEmail" type="email" required autocomplete="email"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                     placeholder="your@email.com">
              <p id="signupEmailError" class="text-xs text-error mt-1 hidden"></p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Password</label>
              <div class="relative">
                <input id="signupPassword" type="password" required autocomplete="new-password"
                       oninput="updatePasswordStrength(this.value)"
                       class="w-full px-4 py-3 pr-11 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                       placeholder="Min. 6 characters">
                <button type="button" onclick="togglePasswordVisibility('signupPassword', this)" 
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
                  <span class="material-symbols-outlined text-lg">visibility_off</span>
                </button>
              </div>
              <!-- Strength Bar -->
              <div id="strengthWrap" class="mt-2 hidden">
                <div class="h-1 rounded-full bg-surface-container-highest overflow-hidden">
                  <div id="strengthBar" class="h-full rounded-full transition-all duration-300" style="width: 0%;"></div>
                </div>
                <p id="strengthLabel" class="text-xs mt-1 font-medium"></p>
              </div>
              <p id="signupPasswordError" class="text-xs text-error mt-1 hidden"></p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Confirm Password</label>
              <input id="signupConfirm" type="password" required autocomplete="new-password"
                     class="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface placeholder-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all text-sm"
                     placeholder="Confirm password">
              <p id="signupConfirmError" class="text-xs text-error mt-1 hidden"></p>
            </div>
          </div>

          <p id="signupError" class="text-xs text-error mt-3 hidden text-center"></p>

          <button id="signupBtn" type="submit"
                  class="w-full mt-6 py-3.5 rounded-full bg-primary-container text-on-primary-container font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <span>Create Account</span>
          </button>
        </form>

        <!-- Divider -->
        <div class="flex items-center gap-4 my-6">
          <div class="flex-1 h-px bg-outline-variant/20"></div>
          <span class="text-xs text-on-surface-variant font-medium">or continue with</span>
          <div class="flex-1 h-px bg-outline-variant/20"></div>
        </div>

        <!-- Google OAuth -->
        <button onclick="handleGoogleAuth()" 
                class="w-full py-3 rounded-full border border-outline-variant/20 text-on-surface font-semibold text-sm hover:bg-surface-container-high/50 transition-all flex items-center justify-center gap-3">
          <svg class="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          <span>Google</span>
        </button>

        <!-- Back to landing -->
        <div class="mt-8 text-center">
          <button onclick="window.location.hash='/landing'" class="text-sm text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span>
            Back to home
          </button>
        </div>
      </div>

      <!-- Success Toast -->
      <div id="successToast" class="fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-semibold text-sm shadow-lg shadow-primary/20 transform -translate-y-20 opacity-0 transition-all duration-300 z-50">
        <span class="flex items-center gap-2">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">check_circle</span>
          <span id="toastMessage">Success!</span>
        </span>
      </div>
    </div>`;
}

function initAuthPage() {
  // Wire up global functions
  window.switchAuthView = (view) => {
    currentView = view;
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    
    if (view === 'login') {
      loginForm?.classList.remove('hidden');
      signupForm?.classList.add('hidden');
      loginTab?.classList.add('bg-primary-container', 'text-on-primary-container');
      loginTab?.classList.remove('text-on-surface-variant');
      signupTab?.classList.remove('bg-primary-container', 'text-on-primary-container');
      signupTab?.classList.add('text-on-surface-variant');
    } else {
      loginForm?.classList.add('hidden');
      signupForm?.classList.remove('hidden');
      signupTab?.classList.add('bg-primary-container', 'text-on-primary-container');
      signupTab?.classList.remove('text-on-surface-variant');
      loginTab?.classList.remove('bg-primary-container', 'text-on-primary-container');
      loginTab?.classList.add('text-on-surface-variant');
    }
  };

  window.handleLogin = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;

    errorEl?.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Signing in...</span>';

    const result = await loginUser({ email, password });
    
    if (result.success) {
      showToast('Welcome back!');
      setTimeout(() => navigate('/dashboard'), 800);
    } else {
      errorEl.textContent = result.message;
      errorEl?.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In</span>';
    }
  };

  window.handleSignup = async (e) => {
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
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Creating account...</span>';

    const result = await registerUser({ email, password, fullName });
    
    if (result.success) {
      if (result.data.requiresEmailConfirmation) {
        showToast('Check your email to confirm!');
        setTimeout(() => window.switchAuthView('login'), 1500);
      } else {
        showToast('Account created!');
        setTimeout(() => navigate('/welcome'), 800);
      }
    } else {
      errorEl.textContent = result.message;
      errorEl?.classList.remove('hidden');
    }
    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span>';
  };

  window.handleGoogleAuth = async () => {
    await signInWithGoogle();
  };

  window.togglePasswordVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility_off';
    }
  };

  window.updatePasswordStrength = (value) => {
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
}

function showToast(message) {
  const toast = document.getElementById('successToast');
  const msgEl = document.getElementById('toastMessage');
  if (toast && msgEl) {
    msgEl.textContent = message;
    toast.classList.remove('-translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.add('-translate-y-20', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2500);
  }
}

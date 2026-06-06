/**
 * FitLife Splash Screen
 * Premium animated splash with logo reveal.
 */
export function renderSplash() {
  // Auto-navigate after animation
  setTimeout(() => {
    window.location.hash = '/landing';
  }, 2800);

  return `
    <div id="splashScreen" class="fixed inset-0 z-[100] flex items-center justify-center bg-surface overflow-hidden">
      <!-- Ambient glow -->
      <div class="absolute inset-0 overflow-hidden">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-0 animate-splash-glow"
             style="background: radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 40%, transparent 70%);"></div>
      </div>
      
      <!-- Logo Container -->
      <div class="relative flex flex-col items-center gap-6 opacity-0 animate-splash-logo">
        <!-- Icon -->
        <div class="relative">
          <div class="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-container to-primary flex items-center justify-center shadow-2xl"
               style="box-shadow: 0 0 60px rgba(34, 197, 94, 0.3);">
            <span class="material-symbols-outlined text-on-primary text-5xl" style="font-variation-settings: 'FILL' 1;">fitness_center</span>
          </div>
          <div class="absolute -inset-2 rounded-[28px] border border-primary/20 animate-pulse"></div>
        </div>
        
        <!-- Brand -->
        <div class="text-center">
          <h1 class="text-4xl font-bold text-on-surface tracking-tight">
            Fit<span class="text-primary">Life</span>
          </h1>
          <p class="text-sm text-on-surface-variant mt-2 font-medium tracking-wider uppercase">AI-Powered Performance</p>
        </div>
        
        <!-- Loading indicator -->
        <div class="flex gap-1.5 mt-4">
          <div class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0ms;"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 150ms;"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 300ms;"></div>
        </div>
      </div>

      <style>
        @keyframes splash-glow {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes splash-logo {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          40% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-10px) scale(0.98); }
        }
        .animate-splash-glow { animation: splash-glow 2.8s ease-in-out forwards; }
        .animate-splash-logo { animation: splash-logo 2.8s ease-in-out forwards; }
      </style>
    </div>`;
}

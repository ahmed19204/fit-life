/**
 * FitLife AI Coach Assistant
 * Real AI-powered nutrition assistant via server-side proxy.
 * SECURITY: No API keys in frontend — calls /api/ai-chat.
 * Uses AI Request Manager for throttling, dedup, and retry.
 * Supports conversation history, quick prompts, and contextual advice.
 */
import { renderNavBar } from '../../components/nav-bar.js';
import { renderPageHeader } from '../../components/page-header.js';
import { getNutritionProfile } from '../../services/ai.js';
import { getCurrentUser, getDisplayName } from '../../services/auth.js';
import { makeDebouncedAIRequest } from '../../services/ai-request-manager.js';

const QUICK_PROMPTS = [
  { icon: 'restaurant', text: 'What should I eat for lunch today?' },
  { icon: 'fitness_center', text: 'How much protein do I need daily?' },
  { icon: 'local_fire_department', text: 'Suggest a pre-workout snack' },
  { icon: 'water_drop', text: 'How much water should I drink?' },
  { icon: 'bedtime', text: 'Best foods to eat before bed?' },
  { icon: 'egg_alt', text: 'Quick high-protein breakfast ideas' },
];

let chatHistory = [];
let userProfile = null;
let userName = 'there';
let isSending = false; // Lock to prevent parallel sends

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li class="ml-3">$1</li>')
    .replace(/(<li.*?<\/li>\n?)+/g, '<ul class="space-y-1 my-2">$&</ul>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-3">$1</li>')
    .replace(/\n/g, '<br>');
}

function getSystemPrompt(profile) {
  const ctx = profile ? `
User Profile:
- Goal: ${profile.goal || 'general health'}
- Activity Level: ${profile.activity_level || 'moderate'}
- Diet Type: ${profile.diet_type || 'balanced'}
- Daily Calories: ${profile.calories || 'not set'}
- Protein Target: ${profile.protein || 'not set'}g, Carbs: ${profile.carbs || 'not set'}g, Fat: ${profile.fat || 'not set'}g
- Restrictions: ${(profile.restrictions || []).join(', ') || 'none'}
- Health Conditions: ${(profile.health_conditions || []).join(', ') || 'none'}
` : 'No profile data available yet.';

  return `You are FitLife AI Coach, a friendly and knowledgeable nutrition and fitness assistant. 
You provide personalized advice based on the user's profile.

${ctx}

Guidelines:
- Be concise (2-4 short paragraphs max)
- Use bullet points for lists
- Be encouraging and supportive
- Reference their specific goals and targets when relevant
- If asked about medical conditions, recommend consulting a doctor
- Focus on practical, actionable advice`;
}

async function callAI(message) {
  const systemPrompt = getSystemPrompt(userProfile);
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'I understand. I am FitLife AI Coach, ready to help with personalized nutrition and fitness advice.' }] },
  ];

  // Add chat history (last 10 messages)
  chatHistory.slice(-10).forEach(msg => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  });

  // Add current message
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    // Use AI Request Manager with debounce to prevent rapid-fire
    const result = await makeDebouncedAIRequest(
      'chat',
      message, // Use message as payload for dedup (same question = cached answer)
      async () => {
        const res = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        });

        if (!res.ok) {
          const err = new Error(`Server returned ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'AI error');
        return data.text || "I couldn't generate a response. Please try again.";
      },
      { cacheTTL: 2 * 60 * 1000 } // 2 minute cache for chat responses
    );
    return result;
  } catch (e) {
    console.error('[AI Coach] Error:', e);
    if (e.message?.includes('busy') || e.message?.includes('queue')) {
      return "I'm processing your request. Please wait a moment and try again.";
    }
    if (e.message?.includes('429') || e.message?.includes('rate')) {
      return "I'm taking a short breather to stay responsive. Please try again in a few seconds.";
    }
    return "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
  }
}

function renderMessage(msg) {
  if (msg.role === 'user') {
    return `
      <div class="flex justify-end mb-3">
        <div class="max-w-[85%] p-3 rounded-2xl rounded-br-md bg-primary-container text-on-primary-container text-sm">
          ${escapeHtml(msg.text)}
        </div>
      </div>`;
  }
  return `
    <div class="flex gap-2 mb-3">
      <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
        <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
      </div>
      <div class="max-w-[85%] p-3 rounded-2xl rounded-bl-md bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface leading-relaxed">
        ${formatResponse(msg.text)}
      </div>
    </div>`;
}

function setupEvents() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const chatArea = document.getElementById('chatMessages');

  if (!input || !sendBtn || !chatArea) return;

  async function sendMessage(text) {
    if (!text.trim() || isSending) return; // Prevent parallel sends
    isSending = true;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Add user message
    chatHistory.push({ role: 'user', text: text.trim() });
    chatArea.innerHTML += renderMessage({ role: 'user', text: text.trim() });

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    chatArea.innerHTML += `
      <div id="${typingId}" class="flex gap-2 mb-3">
        <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary text-sm animate-pulse" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
        </div>
        <div class="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/10">
          <div class="flex gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style="animation-delay: 0ms;"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style="animation-delay: 150ms;"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style="animation-delay: 300ms;"></div>
          </div>
        </div>
      </div>`;
    chatArea.scrollTop = chatArea.scrollHeight;

    // Get AI response
    const response = await callAI(text.trim());
    chatHistory.push({ role: 'assistant', text: response });

    // Remove typing indicator and add response
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    chatArea.innerHTML += renderMessage({ role: 'assistant', text: response });
    chatArea.scrollTop = chatArea.scrollHeight;

    // Hide quick prompts after first message
    const quickPromptsEl = document.getElementById('quickPrompts');
    if (quickPromptsEl) quickPromptsEl.style.display = 'none';

    isSending = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', () => sendMessage(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  // Quick prompt buttons
  window._sendQuickPrompt = (text) => sendMessage(text);
}

export async function renderAssistant() {
  const userRes = await getCurrentUser();
  if (userRes.success && userRes.data.user) {
    userName = getDisplayName(userRes.data.user).split(' ')[0];
  }

  const profileRes = await getNutritionProfile();
  userProfile = profileRes.data?.profile || null;

  // Build page
  const html = `
    <div class="min-h-screen bg-surface text-on-surface flex flex-col" style="height: 100dvh;">
      ${renderPageHeader({ 
        title: 'AI Coach', 
        subtitle: 'Your personal nutrition assistant',
        rightAction: chatHistory.length > 0 ? `
          <button onclick="window._clearChat && window._clearChat()" class="text-xs text-on-surface-variant hover:text-primary transition-colors px-2 py-1 rounded-lg">
            <span class="material-symbols-outlined text-lg">delete_sweep</span>
          </button>` : ''
      })}

      <!-- Chat Messages -->
      <div id="chatMessages" class="flex-1 overflow-y-auto px-4 py-4" style="padding-bottom: 140px;">
        ${chatHistory.length > 0 ? 
          chatHistory.map(msg => renderMessage(msg)).join('') : `
          <!-- Welcome State -->
          <div class="flex gap-2 mb-4">
            <div class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
              <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
            </div>
            <div class="max-w-[85%] p-3 rounded-2xl rounded-bl-md bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface leading-relaxed">
              Hey ${escapeHtml(userName)}! I'm your FitLife AI Coach. I can help you with nutrition advice, meal suggestions, and answer questions about your fitness goals. What would you like to know?
            </div>
          </div>
        `}

        <!-- Quick Prompts -->
        <div id="quickPrompts" class="${chatHistory.length > 0 ? 'hidden' : ''}">
          <div class="grid grid-cols-2 gap-2 mt-4">
            ${QUICK_PROMPTS.map(q => `
              <button onclick="window._sendQuickPrompt('${q.text.replace(/'/g, "\\'")}')"
                      class="flex items-center gap-2 p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/10 text-left text-xs text-on-surface-variant hover:border-primary/30 hover:text-primary transition-all">
                <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">${q.icon}</span>
                <span class="line-clamp-2">${q.text}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Input Bar -->
      <div class="fixed bottom-16 left-0 right-0 px-4 py-3 border-t border-outline-variant/10"
           style="background: rgba(14, 21, 14, 0.95); backdrop-filter: blur(20px);">
        <div class="flex gap-2 max-w-lg mx-auto">
          <input type="text" id="chatInput" placeholder="Ask your AI coach..." 
                 class="flex-1 px-4 py-3 rounded-full bg-surface-container-lowest border border-outline-variant/20 text-on-surface text-sm focus:border-primary outline-none"
                 autocomplete="off">
          <button id="chatSend" class="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center hover:bg-primary transition-colors">
            <span class="material-symbols-outlined text-on-primary-container">send</span>
          </button>
        </div>
      </div>

      ${renderNavBar()}
    </div>`;

  // Setup events after render
  setTimeout(setupEvents, 100);

  // Clear chat handler
  window._clearChat = () => {
    chatHistory = [];
    isSending = false;
    window.location.hash = '/assistant';
  };

  return html;
}

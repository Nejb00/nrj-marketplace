// ═══ Recherche — vocale (SpeechRecognition) ═══
// Éclaté de search.js (refacto-archi).
import { state } from '../core/state.js';
import { showToast } from '../utils/dom-helpers.js';

export function initVoiceSearch() {
  const voiceBtn = document.getElementById('searchVoice');
  const searchInput = document.getElementById('searchInput');

  if (!voiceBtn || !searchInput) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    state.isVoiceListening = true;
    voiceBtn.classList.add('listening');
    searchInput.placeholder = '🎤 Parlez maintenant...';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    searchInput.value = transcript;
    searchInput.dispatchEvent(new Event('input'));
    showToast(`🎤 "${transcript}"`);
  };

  recognition.onerror = (event) => {
    console.warn('Erreur reconnaissance vocale:', event.error);
    if (event.error === 'no-speech') {
      showToast('❌ Aucune parole detectee');
    } else if (event.error === 'not-allowed') {
      showToast('❌ Acces au microphone refuse');
    } else {
      showToast('❌ Erreur de reconnaissance vocale');
    }
  };

  recognition.onend = () => {
    state.isVoiceListening = false;
    voiceBtn.classList.remove('listening');
    searchInput.placeholder = state.rotationList[state.currentPlaceholderIndex];
  };

  voiceBtn.addEventListener('click', () => {
    if (state.isVoiceListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn('Impossible de demarrer la reconnaissance vocale:', e);
      }
    }
  });
}

/**
 * Senior Swipe - Network Integrated Architecture
 */

// Generate or retrieve Session ID
let sessionId = localStorage.getItem('swiper_session_id');
if (!sessionId) {
  sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('swiper_session_id', sessionId);
}

let API_BASE = '';
// Automatically detect if you are running via Live Server (port 5500) vs Node (port 3000)
// If it detects Live Server, it will correctly route background traffic to your node server!
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  if (window.location.port !== '3000') {
    API_BASE = 'http://localhost:3000';
  }
}

let currentQuestion = null;
let topCard = null;
let topCardHammer = null;
let currentLeaderboardTrait = null;

// Audio Context for synthesized sounds
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
}

function playSound(type) {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'yes') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.2);
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'no') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.3);
    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------

function initApp() {
  // Bind Action Buttons
  document.getElementById('btn-no').addEventListener('click', () => handleButtonSwipe('no'));
  document.getElementById('btn-yes').addEventListener('click', () => handleButtonSwipe('yes'));

  // Bind Keyboard
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('swipe-view').classList.contains('active') && topCard) {
      if (e.key === 'ArrowRight') handleButtonSwipe('yes');
      if (e.key === 'ArrowLeft') handleButtonSwipe('no');
    }
  });

  // Audio unlock
  document.body.addEventListener('pointerdown', initAudio, { once: true });
  document.body.addEventListener('keydown', initAudio, { once: true });

  // Initial fetch
  fetchNextQuestion();
}

// ----------------------------------------------------
// Network Queries
// ----------------------------------------------------

async function fetchNextQuestion() {
  try {
    const res = await fetch(`${API_BASE}/next-question?session_id=${sessionId}`);
    const data = await res.json();

    if (data.done) {
        showEndScreen();
        return;
    }

    currentQuestion = data;
    renderCard(currentQuestion);
  } catch (err) {
    console.error("Failed to fetch next question:", err);
    document.getElementById('current-question-text').innerText = "Network Error! Is the backend running on localhost:3000?";
  }
}

async function submitSwipeToBackend(responseType) {
  if (!currentQuestion) return;

  try {
    const payload = {
      session_id: sessionId,
      senior_id: currentQuestion.senior_id,
      trait_id: currentQuestion.trait_id,
      response: responseType
    };

    await fetch(`${API_BASE}/submit-swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Failed to submit swipe:", err);
  }
}

// ----------------------------------------------------
// UI Rendering & Swipe Logic
// ----------------------------------------------------

function renderCard(questionData) {
  document.getElementById('current-question-text').innerText = `"${questionData.question_text}"`;
  
  const container = document.getElementById('card-stack');
  container.innerHTML = '';
  
  const card = document.createElement('div');
  card.className = 'card';
  card.style.transform = `translateY(0px) scale(1)`;
  card.style.zIndex = 1;
  
  // Load the image from the local folder based on caricature_id
  const imgSrc = `./images/${questionData.caricature_id}`;

  card.innerHTML = `
    <img src="${imgSrc}" alt="${questionData.name}" draggable="false" />
    <div class="card-info">
      <div class="card-header">
         <span class="card-name">${questionData.name}</span>
         <span class="card-year">${questionData.alias}</span>
      </div>
      <p class="card-bio">Swipe right if yes, left if no!</p>
    </div>
    
    <div class="swipe-overlay overlay-yes">YES✅</div>
    <div class="swipe-overlay overlay-no">NO❌</div>
  `;
  
  container.appendChild(card);
  topCard = card;
  initHammer(topCard);
}

function initHammer(card) {
  if (topCardHammer) topCardHammer.destroy();
  
  topCardHammer = new Hammer(card);
  topCardHammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 10 });
  
  const maxDisplacement = window.innerWidth / 2;
  const overlayYes = card.querySelector('.overlay-yes');
  const overlayNo = card.querySelector('.overlay-no');
  
  let isDragging = false;
  
  topCardHammer.on('panstart', () => {
    isDragging = true;
    card.style.transition = 'none';
  });
  
  topCardHammer.on('panmove', (e) => {
    if (!isDragging) return;
    const x = e.deltaX;
    const y = e.deltaY;
    const rotate = x * 0.05;
    
    card.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg)`;
    
    overlayYes.style.opacity = Math.max(0, x / (maxDisplacement / 2));
    overlayNo.style.opacity = Math.max(0, -x / (maxDisplacement / 2));
  });
  
  topCardHammer.on('panend', (e) => {
    isDragging = false;
    card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    
    const velocity = Math.abs(e.velocityX);
    const displacement = Math.abs(e.deltaX);
    
    if (velocity > 0.5 || displacement > 100) {
      const isYes = e.deltaX > 0;
      processSwipe(isYes ? 'yes' : 'no', isYes ? 'fly-right' : 'fly-left', card);
    } else {
      card.style.transform = `translate(0px, 0px) rotate(0deg)`;
      overlayYes.style.opacity = 0;
      overlayNo.style.opacity = 0;
    }
  });
}

function handleButtonSwipe(type) {
  if (!topCard) return;
  const animClass = type === 'yes' ? 'fly-right' : 'fly-left';
  processSwipe(type, animClass, topCard);
}

async function processSwipe(type, animClass, cardEl) {
  topCard = null; // Prevent double swipe
  
  if (type === 'yes') cardEl.querySelector('.overlay-yes').style.opacity = 1;
  else if (type === 'no') cardEl.querySelector('.overlay-no').style.opacity = 1;

  cardEl.classList.add(animClass);
  playSound(type);

  // Send request asynchronously
  await submitSwipeToBackend(type);

  // Buffer slightly for animation
  setTimeout(() => {
    fetchNextQuestion();
  }, 200);
}

// ----------------------------------------------------
// Views & Navigation
// ----------------------------------------------------

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById(`nav-${tabId}`);
  if(navBtn) navBtn.classList.add('active');
  
  document.getElementById('swipe-view').classList.toggle('active', tabId === 'swipe');
  document.getElementById('swipe-view').classList.toggle('hidden', tabId !== 'swipe');

  document.getElementById('leaderboard-view').classList.toggle('active', tabId === 'leaderboard');
  document.getElementById('leaderboard-view').classList.toggle('hidden', tabId !== 'leaderboard');
  
  document.getElementById('end-view').classList.add('hidden');
  document.getElementById('end-view').classList.remove('active');

  if (tabId === 'leaderboard') {
    const filters = document.getElementById('traits-filter');
    if (filters && filters.children.length === 0) {
      fetchAndRenderTraits();
    }
    renderLeaderboard();
  } else if (tabId === 'swipe' && !currentQuestion) {
    fetchNextQuestion();
  }
}

function showEndScreen() {
  document.getElementById('swipe-view').classList.remove('active');
  document.getElementById('swipe-view').classList.add('hidden');
  document.getElementById('end-view').classList.remove('hidden');
  document.getElementById('end-view').classList.add('active');
}

// ----------------------------------------------------
// Leaderboard Logic
// ----------------------------------------------------

async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  container.innerHTML = '<h3>Loading...</h3>';
  
  try {
    const url = currentLeaderboardTrait 
        ? `${API_BASE}/leaderboard?trait_id=${currentLeaderboardTrait}`
        : `${API_BASE}/leaderboard`;
        
    const res = await fetch(url);
    const scoredMembers = await res.json();
    
    container.innerHTML = '';
    
    scoredMembers.forEach((m, idx) => {
      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      let rankDisplay = `#${idx + 1}`;
      if (idx === 0) rankDisplay = '🥇';
      if (idx === 1) rankDisplay = '🥈';
      if (idx === 2) rankDisplay = '🥉';
      
      const imgSrc = `./images/${m.caricature_id}`;

      const div = document.createElement('div');
      div.className = `leaderboard-item ${rankClass}`;
      div.style.animationDelay = `${idx * 0.1}s`;
      
      div.innerHTML = `
        <div class="rank">${rankDisplay}</div>
        <img src="${imgSrc}" class="avatar" draggable="false" style="background:#fff;" />
        <div class="lb-info">
          <div class="lb-name">${m.name}</div>
          <div class="lb-role">${m.alias}</div>
        </div>
        <div class="lb-score">
           Score: ${m.score}
        </div>
      `;
      
      container.appendChild(div);
    });

    if (scoredMembers.length > 0 && typeof confetti === 'function') {
      triggerConfetti();
    }
  } catch (err) {
    console.error("Leaderboard Error:", err);
    container.innerHTML = '<h3>Error loading leaderboard</h3>';
  }
}

function triggerConfetti() {
  const duration = 2000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#FF2D6B', '#00F5D4', '#FFD700'] });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FF2D6B', '#00F5D4', '#FFD700'] });

    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

async function fetchAndRenderTraits() {
  try {
    const res = await fetch(`${API_BASE}/traits`);
    const traits = await res.json();
    
    const container = document.getElementById('traits-filter');
    container.innerHTML = `<div class="trait-pill active" onclick="filterLeaderboard(null, this)">Overall</div>`;
    
    traits.forEach(t => {
      const pill = document.createElement('div');
      pill.className = 'trait-pill';
      pill.innerText = t.question_text.length > 25 ? t.question_text.substring(0, 25) + '...' : t.question_text;
      pill.onclick = () => filterLeaderboard(t.id, pill);
      container.appendChild(pill);
    });
  } catch (err) {
    console.error("Traits fetch error:", err);
  }
}

function filterLeaderboard(traitId, pillEl) {
  document.querySelectorAll('.trait-pill').forEach(el => el.classList.remove('active'));
  pillEl.classList.add('active');
  
  currentLeaderboardTrait = traitId;
  const subtitle = traitId ? "Top 3 for Selected Trait" : "Top 3 Overall Standing";
  const subtitleEl = document.getElementById('lb-subtitle');
  if (subtitleEl) subtitleEl.innerText = subtitle;
  
  renderLeaderboard();
}

function resetSession() {
  localStorage.removeItem('swiper_session_id');
  window.location.reload();
}

window.onload = initApp;

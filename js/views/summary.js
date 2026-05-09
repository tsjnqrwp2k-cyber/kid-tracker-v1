// views/summary.js — daily / monthly / yearly progress + voucher tally.

import { get, subscribe } from '../state.js';
import { getTodayKey, totalStars, getTodayTasks, isTaskCompleteToday } from '../tasks.js';

const TIER_LABELS = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold', platinum: '💎 Platinum' };

let mountedContainer = null;
let unsubscribe = null;
let activeRange = 'daily';

export function render(container) {
  mountedContainer = container;
  if (!unsubscribe) unsubscribe = subscribe(() => { if (mountedContainer) draw(); });
  draw();
}

function draw() {
  if (!mountedContainer) return;
  const stats = computeStats(activeRange);

  mountedContainer.innerHTML = `
    <div class="settings-header">
      <h1 class="page-title">📊 My Progress</h1>
    </div>

    <div class="tabs">
      <button class="tab ${activeRange === 'daily'   ? 'active' : ''}" data-range="daily">Today</button>
      <button class="tab ${activeRange === 'monthly' ? 'active' : ''}" data-range="monthly">This Month</button>
      <button class="tab ${activeRange === 'yearly'  ? 'active' : ''}" data-range="yearly">This Year</button>
    </div>

    <div class="card stat-card">
      <div class="stat-pct">${stats.pct}%</div>
      <div class="stat-rating">${'⭐'.repeat(stats.rating)}${'☆'.repeat(5 - stats.rating)}</div>
      <div class="stat-message">${stats.message}</div>
      <div class="stat-row">
        <div><strong>${stats.starsTotal}</strong> stars earned</div>
        <div><strong>${stats.daysCompleted}</strong> ${stats.daysCompleted === 1 ? 'perfect day' : 'perfect days'}</div>
      </div>
      ${stats.starsRemoved > 0 ? `<div class="stat-removed">⚠️ ${stats.starsRemoved} stars removed</div>` : ''}
    </div>

    ${renderVoucherCard()}
  `;

  bindEvents();
}

function bindEvents() {
  mountedContainer.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => { activeRange = btn.dataset.range; draw(); });
  });
}

function computeStats(range) {
  const state = get();
  const now = new Date();
  const todayKey = getTodayKey(now);

  if (range === 'daily') {
    const tasks = getTodayTasks();
    const total = tasks.length;
    const done = tasks.filter(t => isTaskCompleteToday(t.id)).length;
    const pct = total ? Math.round(100 * done / total) : 0;
    return {
      pct,
      rating: pctToRating(pct),
      message: messageForPct(pct),
      starsTotal: state.history[todayKey]?.completed?.length || 0,
      starsRemoved: 0,
      daysCompleted: state.history[todayKey]?.stamped ? 1 : 0
    };
  }

  // monthly / yearly: aggregate from history
  const filterFn = range === 'monthly'
    ? (key) => key.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    : (key) => key.startsWith(`${now.getFullYear()}-`);

  const keys = Object.keys(state.history).filter(filterFn);
  const starsTotal = keys.reduce((sum, k) => sum + (state.history[k].completed?.length || 0), 0);
  const stamped = keys.filter(k => state.history[k].stamped).length;
  const periodLength = range === 'monthly' ? now.getDate() : daysIntoYear(now);
  const pct = periodLength ? Math.round(100 * stamped / periodLength) : 0;

  return {
    pct,
    rating: pctToRating(pct),
    message: messageForPct(pct),
    starsTotal,
    starsRemoved: state.stars.removed, // running total — not period-bucketed by design
    daysCompleted: stamped
  };
}

function pctToRating(pct) {
  if (pct >= 90) return 5;
  if (pct >= 70) return 4;
  if (pct >= 50) return 3;
  if (pct >= 25) return 2;
  if (pct > 0)   return 1;
  return 0;
}

function messageForPct(pct) {
  if (pct >= 90) return "🌟 You're a superstar!";
  if (pct >= 70) return '💪 Amazing job, keep it up!';
  if (pct >= 50) return '👍 Great progress!';
  if (pct >= 25) return "🌱 You're growing every day!";
  if (pct > 0)   return '✨ Every task counts — keep going!';
  return '🚀 Ready to start your first task?';
}

function daysIntoYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function renderVoucherCard() {
  const v = get().vouchers;
  const earnedEver = v.earned.length + v.claimed.length;
  const breakdownByTier = (list) => {
    const counts = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    for (const x of list) counts[x.tier] = (counts[x.tier] || 0) + 1;
    return Object.entries(counts).filter(([_, n]) => n > 0)
      .map(([tier, n]) => `<span class="tier-pill tier-${tier}">${TIER_LABELS[tier]} × ${n}</span>`).join('');
  };

  return `
    <div class="card voucher-card">
      <h2 class="section-title">🎟️ Vouchers</h2>
      <div class="voucher-summary">
        <div><strong>${earnedEver}</strong> earned ever</div>
        <div><strong>${v.earned.length}</strong> waiting to claim</div>
        <div><strong>${v.claimed.length}</strong> claimed</div>
      </div>

      ${v.earned.length > 0 ? `
        <h3 class="subsection-title">Waiting to claim</h3>
        <div class="tier-row">${breakdownByTier(v.earned)}</div>
      ` : ''}

      ${v.claimed.length > 0 ? `
        <h3 class="subsection-title">Claimed</h3>
        <ul class="claimed-list">
          ${v.claimed.slice().reverse().map(c => `
            <li>
              <span class="tier-pill tier-${c.tier}">${TIER_LABELS[c.tier]}</span>
              <span class="claim-label">${c.label ? `— ${escapeHtml(c.label)}` : ''}</span>
              <span class="claim-date">on ${escapeHtml(c.claimedDate)}</span>
            </li>
          `).join('')}
        </ul>
      ` : ''}

      ${earnedEver === 0 ? `<p class="muted">Earn 25 stars to unlock your first voucher! ⭐</p>` : ''}
    </div>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

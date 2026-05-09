// vouchers.js — tiered voucher detection and celebration animation.
// Tiers are earned ONCE on first crossing of cumulative stars-earned-ever.
// Star removal (parent punishment) does NOT revoke an already-earned voucher.

import { get, mutate, subscribe } from './state.js';
import { getTodayKey } from './tasks.js';
import { playSfx } from './audio.js';

export const TIER_THRESHOLDS = [
  { tier: 'bronze',   stars: 25  },
  { tier: 'silver',   stars: 100 },
  { tier: 'gold',     stars: 250 },
  { tier: 'platinum', stars: 500 }
];

export const TIER_NAMES = ['bronze', 'silver', 'gold', 'platinum'];

export function claimVoucher(voucherId) {
  mutate(s => {
    const idx = s.vouchers.earned.findIndex(v => v.id === voucherId);
    if (idx < 0) return;
    const v = s.vouchers.earned[idx];
    s.vouchers.earned.splice(idx, 1);
    s.vouchers.claimed.push({
      ...v,
      claimedDate: getTodayKey(),
      label: s.vouchers.rewardLabels[v.tier] || ''
    });
  });
}

export function setRewardLabel(tier, label) {
  mutate(s => { s.vouchers.rewardLabels[tier] = label || ''; });
}

const TIER_DISPLAY = {
  bronze:   { emoji: '🥉', label: 'Bronze' },
  silver:   { emoji: '🥈', label: 'Silver' },
  gold:     { emoji: '🥇', label: 'Gold' },
  platinum: { emoji: '💎', label: 'Platinum' }
};

let initialized = false;

export function initVoucherDetector() {
  if (initialized) return;
  initialized = true;
  subscribe(checkTiers);
  checkTiers();
}

function checkTiers() {
  const state = get();
  const totalEarned = state.stars.earned;
  const have = new Set([
    ...state.vouchers.earned.map(v => v.tier),
    ...state.vouchers.claimed.map(v => v.tier)
  ]);
  for (const { tier, stars } of TIER_THRESHOLDS) {
    if (totalEarned >= stars && !have.has(tier)) {
      awardVoucher(tier);
      have.add(tier);
    }
  }
}

function awardVoucher(tier) {
  mutate(s => {
    s.vouchers.earned.push({
      id: 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      tier,
      earnedDate: getTodayKey()
    });
  });
  showVoucherCelebration(tier);
  try { playSfx('voucher'); } catch {}
}

function showVoucherCelebration(tier) {
  const info = TIER_DISPLAY[tier];
  const host = document.getElementById('confetti-host');
  if (!host) return;
  const banner = document.createElement('div');
  banner.className = `voucher-banner voucher-banner-${tier}`;
  banner.innerHTML = `
    <div class="voucher-banner-inner">
      <div class="voucher-emoji">${info.emoji}</div>
      <div class="voucher-title">You earned a ${info.label} Voucher!</div>
      <div class="voucher-sub">Tap to dismiss</div>
    </div>
  `;
  host.appendChild(banner);
  const dismiss = () => banner.remove();
  banner.addEventListener('click', dismiss);
  setTimeout(dismiss, 6000);
}

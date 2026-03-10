/**
 * useProAccess.ts — ZERØ ORDER BOOK v81
 * v81: tambah 5-menit trial — localStorage timer, auto-expire.
 * rgba() only ✓ · React.memo ✓
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY  = 'zerob_ob_license';
const TRIAL_KEY    = 'zerob_ob_trial_start';
const TRIAL_SHOWN  = 'zerob_ob_trial_shown';
const TRIAL_MS     = 5 * 60 * 1000; // 5 minutes

export function useProAccess() {
  const [isPro,        setIsPro]        = useState(false);
  const [trialActive,  setTrialActive]  = useState(false);
  const [trialSecsLeft, setTrialSecsLeft] = useState(0);
  const [trialShown,   setTrialShown]   = useState(false);

  useEffect(() => {
    // Check license
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { setIsPro(true); return; }

    // Check trial
    const shown = localStorage.getItem(TRIAL_SHOWN);
    setTrialShown(!!shown);

    const start = localStorage.getItem(TRIAL_KEY);
    if (start) {
      const elapsed = Date.now() - parseInt(start);
      if (elapsed < TRIAL_MS) {
        setTrialActive(true);
        setTrialSecsLeft(Math.ceil((TRIAL_MS - elapsed) / 1000));
      }
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!trialActive) return;
    const id = setInterval(() => {
      const start = localStorage.getItem(TRIAL_KEY);
      if (!start) { setTrialActive(false); return; }
      const remaining = TRIAL_MS - (Date.now() - parseInt(start));
      if (remaining <= 0) {
        setTrialActive(false);
        setTrialSecsLeft(0);
      } else {
        setTrialSecsLeft(Math.ceil(remaining / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [trialActive]);

  const startTrial = useCallback(() => {
    localStorage.setItem(TRIAL_KEY, Date.now().toString());
    localStorage.setItem(TRIAL_SHOWN, '1');
    setTrialActive(true);
    setTrialShown(true);
    setTrialSecsLeft(TRIAL_MS / 1000);
  }, []);

  const unlock = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setIsPro(true);
    setTrialActive(false);
  }, []);

  const revoke = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsPro(false);
  }, []);

  const isUnlocked = isPro || trialActive;

  return { isPro, isUnlocked, trialActive, trialSecsLeft, trialShown, startTrial, unlock, revoke };
}


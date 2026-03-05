/**
 * useProAccess.ts — ZERØ ORDER BOOK
 * Cek apakah user sudah unlock PRO (ada license key di localStorage).
 * rgba() only ✓ · React.memo ✓
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'zerob_ob_license';

export function useProAccess() {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setIsPro(true);
  }, []);

  const unlock = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setIsPro(true);
  }, []);

  const revoke = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsPro(false);
  }, []);

  return { isPro, unlock, revoke };
}

/**
 * deviceProfiler.ts — ZERØ ORDER BOOK v51
 * rgba() only ✓ · zero localStorage ✓ · pure functions ✓
 */
export type DeviceTier = 'high' | 'mid' | 'low';

export interface DeviceProfile {
  tier:             DeviceTier;
  maxFps:           number;
  maxLevels:        number;
  cvdWindow:        number;
  enableAnimations: boolean;
}

export function detectDeviceProfile(): DeviceProfile {
  const cores  = navigator.hardwareConcurrency ?? 2;
  const memory = (navigator as unknown as Record<string,number>).deviceMemory ?? 2;
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  let score = 0;
  if (cores  >= 6) score += 2; else if (cores  >= 4) score += 1;
  if (memory >= 8) score += 2; else if (memory >= 4) score += 1;
  if (!mobile)     score += 1;

  if (score >= 4) return { tier: 'high', maxFps: 60, maxLevels: 50, cvdWindow: 500, enableAnimations: true };
  if (score >= 2) return { tier: 'mid',  maxFps: 30, maxLevels: 25, cvdWindow: 200, enableAnimations: true };
  return           { tier: 'low',  maxFps: 15, maxLevels: 10, cvdWindow:  50, enableAnimations: false };
}

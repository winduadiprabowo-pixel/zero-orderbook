/**
 * LicenseGate.tsx — ZERØ ORDER BOOK v40
 * ProLock: premium overlay — trader FEELS what they're missing.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

interface LicenseModalProps {
  onUnlock: (key: string) => void;
  onClose:  () => void;
}

const LicenseModal: React.FC<LicenseModalProps> = React.memo(({ onUnlock, onClose }) => {
  const [key,     setKey]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 100);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleVerify = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Enter your license key from Gumroad.'); return; }
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${PROXY_URL}/verify-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: trimmed, product_id: 'atbwr' }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => { if (mountedRef.current) onUnlock(trimmed); }, 600);
      } else {
        setError(data.message ?? 'Invalid key. Check your Gumroad email.');
      }
    } catch {
      if (mountedRef.current) setError('Connection failed. Try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, onUnlock]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerify();
  }, [handleVerify]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        padding: '24px',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '400px',
          background: 'rgba(14,17,26,1)',
          border: '1px solid rgba(242,142,44,0.22)',
          borderRadius: '8px',
          padding: '28px 24px 24px',
          position: 'relative',
          boxShadow: '0 0 60px rgba(242,142,44,0.08), 0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: '14px', right: '14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.20)', fontSize: '14px', fontFamily: 'inherit', padding: '4px', lineHeight: 1 }}>✕</button>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(242,142,44,0.90)', letterSpacing: '0.16em', marginBottom: '10px', textTransform: 'uppercase' as const }}>
            ⚡ ZERØ ORDER BOOK PRO
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.4, marginBottom: '10px', letterSpacing: '-0.01em' }}>
            See what the smart money sees.
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.7 }}>
            Depth Chart · Liquidation Feed · Market Data
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
          {['Depth Chart', 'Liq Feed', 'Market Data', 'Lifetime Access'].map(f => (
            <span key={f} style={{ padding: '3px 9px', background: 'rgba(242,142,44,0.07)', border: '1px solid rgba(242,142,44,0.14)', borderRadius: '3px', fontSize: '9px', fontWeight: 700, color: 'rgba(242,142,44,0.75)', letterSpacing: '0.06em' }}>{f}</span>
          ))}
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginBottom: '18px' }} />

        <a
          href="https://zerobuildlab.gumroad.com/l/atbwr"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '48px', marginBottom: '16px', padding: '0 18px', boxSizing: 'border-box' as const, background: 'rgba(242,142,44,0.12)', border: '1px solid rgba(242,142,44,0.35)', borderRadius: '6px', textDecoration: 'none' }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em' }}>Get PRO — one-time payment</span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'rgba(242,142,44,1)' }}>$9 →</span>
        </a>

        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.10em', marginBottom: '8px', textTransform: 'uppercase' as const }}>
          Already bought? Enter your key
        </div>

        <div style={{ marginBottom: error ? '8px' : '12px' }}>
          <input ref={inputRef} type="text" value={key} onChange={e => { setKey(e.target.value); setError(null); }} onKeyDown={handleKeyDown} placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" disabled={loading || success} spellCheck={false} autoComplete="off"
            style={{ width: '100%', boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.03)', border: `1px solid ${error ? 'rgba(239,83,80,0.40)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '5px', padding: '9px 12px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(255,255,255,0.85)', outline: 'none', letterSpacing: '0.02em' }}
          />
        </div>

        {error && <div style={{ fontSize: '10px', color: 'rgba(239,83,80,0.80)', marginBottom: '10px', lineHeight: 1.5 }}>{error}</div>}
        {success && <div style={{ fontSize: '10px', color: 'rgba(38,166,154,1)', marginBottom: '10px', letterSpacing: '0.06em' }}>✓ Unlocked</div>}

        <button onClick={handleVerify} disabled={loading || success || !key.trim()}
          style={{ width: '100%', height: '36px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '5px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', cursor: loading || success || !key.trim() ? 'not-allowed' : 'pointer', opacity: !key.trim() && !loading ? 0.5 : 1 }}>
          {loading ? 'Verifying...' : success ? '✓ Unlocked' : 'Activate Key'}
        </button>

        <div style={{ marginTop: '14px', textAlign: 'center' as const, fontSize: '9px', color: 'rgba(255,255,255,0.12)', lineHeight: 1.6 }}>
          Key saved on this device. No subscription.
        </div>
      </div>
    </div>
  );
});
LicenseModal.displayName = 'LicenseModal';

// ── ProLock — premium locked panel ───────────────────────────────────────────

interface ProLockProps {
  isPro:      boolean;
  onClickPro: () => void;
  children:   React.ReactNode;
  label?:     string;
}

export const ProLock: React.FC<ProLockProps> = React.memo(({ isPro, onClickPro, children, label }) => {
  if (isPro) return <>{children}</>;

  const features: Record<string, { icon: string; desc: string }> = {
    'DEPTH CHART':       { icon: '📊', desc: 'Bid/ask walls visualized — spot where price stalls' },
    'LIQUIDATION FEED':  { icon: '💥', desc: 'Live liq events — track where whales get wiped' },
    'MARKET DATA':       { icon: '📈', desc: 'Funding rate, OI, 24h stats — full market context' },
  };
  const feat = label ? features[label] : null;

  return (
    <div onClick={onClickPro} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', cursor: 'pointer' }}>
      {/* Content blurred — FEELS real, makes trader want it */}
      <div style={{ opacity: 0.18, filter: 'blur(3px)', height: '100%', pointerEvents: 'none', userSelect: 'none' as const }}>
        {children}
      </div>

      {/* Gradient vignette — stronger so overlay is clear */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,7,15,0.4) 0%, rgba(5,7,15,0.75) 100%)', pointerEvents: 'none' }} />

      {/* CTA overlay */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px' }}>

        {feat && (
          <div style={{
            textAlign: 'center' as const,
            fontFamily: '"IBM Plex Mono", monospace',
            marginBottom: '4px',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{feat.icon}</div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.01em', marginBottom: '6px' }}>
              {label}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: '200px' }}>
              {feat.desc}
            </div>
          </div>
        )}

        {/* Primary CTA — gold, high contrast */}
        <button style={{
          padding: '10px 26px',
          background: 'rgba(242,162,33,0.18)',
          border: '1.5px solid rgba(242,162,33,0.70)',
          borderRadius: '6px',
          fontSize: '11px', fontWeight: 800,
          color: 'rgba(242,162,33,1)',
          letterSpacing: '0.12em',
          fontFamily: '"IBM Plex Mono", monospace',
          cursor: 'pointer',
          boxShadow: '0 0 32px rgba(242,162,33,0.18), inset 0 0 16px rgba(242,162,33,0.06)',
          transition: 'all 120ms',
        }}>
          UNLOCK PRO — $9
        </button>

        {/* Tap hint — makes it super clear this is interactive */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '9px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', fontFamily: '"IBM Plex Mono", monospace' }}>
          <span style={{ fontSize: 11 }}>👆</span> TAP ANYWHERE TO UNLOCK
        </div>

        <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em', fontFamily: '"IBM Plex Mono", monospace' }}>
          one-time · lifetime · all features
        </div>
      </div>
    </div>
  );
});
ProLock.displayName = 'ProLock';

export default LicenseModal;

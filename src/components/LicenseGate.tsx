/**
 * LicenseGate.tsx — ZERØ ORDER BOOK
 * Subtle PRO gate — no pushy overlay, just a quiet locked state.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

// ── Modal ─────────────────────────────────────────────────────────────────────

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
        background: 'rgba(0,0,0,0.60)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        padding: '24px',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '380px',
          background: 'rgba(14,17,26,1)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '28px 24px 24px',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.20)', fontSize: '14px',
            fontFamily: 'inherit', padding: '4px',
            lineHeight: 1,
          }}
        >✕</button>

        {/* Header */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(242,142,44,0.80)',
            letterSpacing: '0.12em', marginBottom: '8px',
          }}>
            ZERØ ORDER BOOK PRO
          </div>
          <div style={{
            fontSize: '13px', fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.5, marginBottom: '6px',
          }}>
            Depth Chart · Liquidation Feed · Market Data
          </div>
          <div style={{
            fontSize: '10px', color: 'rgba(255,255,255,0.30)',
            lineHeight: 1.6,
          }}>
            One-time payment. Yours forever.
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginBottom: '20px' }} />

        {/* Buy CTA */}
        <a
          href="https://zerobuildlab.gumroad.com/l/atbwr"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', height: '42px', marginBottom: '20px',
            padding: '0 16px', boxSizing: 'border-box',
            background: 'rgba(242,142,44,0.10)',
            border: '1px solid rgba(242,142,44,0.25)',
            borderRadius: '6px', textDecoration: 'none',
          }}
        >
          <span style={{
            fontSize: '11px', fontWeight: 700,
            color: 'rgba(255,255,255,0.70)', letterSpacing: '0.04em',
          }}>Get PRO access</span>
          <span style={{
            fontSize: '13px', fontWeight: 800,
            color: 'rgba(242,142,44,1)',
          }}>$9 →</span>
        </a>

        {/* Already bought */}
        <div style={{
          fontSize: '9px', color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.10em', marginBottom: '10px',
          textTransform: 'uppercase',
        }}>
          Already bought? Enter your key
        </div>

        <div style={{ marginBottom: error ? '8px' : '12px' }}>
          <input
            ref={inputRef}
            type="text"
            value={key}
            onChange={e => { setKey(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            disabled={loading || success}
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${error ? 'rgba(239,83,80,0.40)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '5px', padding: '9px 12px',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px', color: 'rgba(255,255,255,0.85)',
              outline: 'none', letterSpacing: '0.02em',
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: '10px', color: 'rgba(239,83,80,0.80)', marginBottom: '10px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ fontSize: '10px', color: 'rgba(38,166,154,1)', marginBottom: '10px', letterSpacing: '0.06em' }}>
            ✓ Unlocked
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || success || !key.trim()}
          style={{
            width: '100%', height: '36px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: '5px',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.08em',
            cursor: loading || success || !key.trim() ? 'not-allowed' : 'pointer',
            opacity: !key.trim() && !loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Verifying...' : success ? '✓ Unlocked' : 'Activate Key'}
        </button>

        <div style={{
          marginTop: '14px', textAlign: 'center',
          fontSize: '9px', color: 'rgba(255,255,255,0.12)', lineHeight: 1.6,
        }}>
          Key is saved on this device.
        </div>
      </div>
    </div>
  );
});

LicenseModal.displayName = 'LicenseModal';

// ── ProLock — subtle locked panel ─────────────────────────────────────────────

interface ProLockProps {
  isPro:      boolean;
  onClickPro: () => void;
  children:   React.ReactNode;
  label?:     string;
}

export const ProLock: React.FC<ProLockProps> = React.memo(({ isPro, onClickPro, children, label }) => {
  if (isPro) return <>{children}</>;

  return (
    <div
      onClick={onClickPro}
      style={{
        position: 'relative', height: '100%', width: '100%',
        overflow: 'hidden', cursor: 'pointer',
      }}
    >
      {/* Content — visible but muted */}
      <div style={{ opacity: 0.15, height: '100%', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>

      {/* Subtle center prompt */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '8px',
      }}>
        <div style={{
          fontSize: '9px', fontWeight: 700,
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {label ?? 'PRO'}
        </div>
        <div style={{
          padding: '4px 12px',
          border: '1px solid rgba(242,142,44,0.20)',
          borderRadius: '3px',
          fontSize: '9px', fontWeight: 600,
          color: 'rgba(242,142,44,0.60)',
          letterSpacing: '0.08em',
          fontFamily: '"IBM Plex Mono", monospace',
          background: 'rgba(242,142,44,0.04)',
        }}>
          unlock
        </div>
      </div>
    </div>
  );
});

ProLock.displayName = 'ProLock';

export default LicenseModal;

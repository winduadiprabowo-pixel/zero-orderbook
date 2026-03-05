/**
 * LicenseGate.tsx — ZERØ ORDER BOOK
 * Freemium modal — bukan hard gate.
 * Muncul saat user klik fitur PRO yang di-lock.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

interface LicenseModalProps {
  onUnlock: (key: string) => void;
  onClose:  () => void;
}

const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleVerify = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Masukkan license key dari Gumroad.'); return; }

    setLoading(true);
    setError(null);

    try {
      const res  = await fetch(`${PROXY_URL}/verify-license`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ license_key: trimmed, product_id: 'atbwr' }),
      });
      const data = await res.json();

      if (!mountedRef.current) return;

      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => { if (mountedRef.current) onUnlock(trimmed); }, 700);
      } else {
        setError(data.message ?? 'License key tidak valid. Cek email Gumroad kamu.');
      }
    } catch {
      if (mountedRef.current) setError('Gagal konek ke server. Coba lagi.');
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
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        padding: '24px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '400px',
          background: 'rgba(16,19,28,1)',
          border: '1px solid rgba(242,142,44,0.30)',
          borderRadius: '6px',
          padding: '32px 28px 28px',
          boxShadow: '0 0 60px rgba(242,142,44,0.10)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '12px', right: '14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.25)', fontSize: '16px', lineHeight: 1,
            fontFamily: 'inherit', padding: '4px',
          }}
        >✕</button>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(242,142,44,1)', letterSpacing: '0.10em', marginBottom: '6px' }}>
            ⚡ PRO FEATURE
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'rgba(255,255,255,0.92)', marginBottom: '4px' }}>
            Unlock ZERØ ORDER BOOK PRO
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', lineHeight: 1.6 }}>
            Liquidation Feed · Market Data · Depth Chart
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />

        <a
          href="https://zerobuildlab.gumroad.com/l/atbwr"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '40px', marginBottom: '16px',
            background: 'rgba(242,142,44,0.15)',
            border: '1px solid rgba(242,142,44,0.50)',
            borderRadius: '4px', textDecoration: 'none',
            fontSize: '11px', fontWeight: 800,
            color: 'rgba(242,142,44,1)', letterSpacing: '0.08em',
          }}
        >
          Beli Sekarang — $9 Lifetime ↗
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)', letterSpacing: '0.08em' }}>SUDAH BELI?</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{
            display: 'block', fontSize: '9px', fontWeight: 700,
            color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', marginBottom: '7px',
          }}>
            LICENSE KEY
          </label>
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
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${error ? 'rgba(239,83,80,0.60)' : 'rgba(255,255,255,0.10)'}`,
              borderRadius: '4px', padding: '9px 11px',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px', fontWeight: 500,
              color: 'rgba(255,255,255,0.90)', letterSpacing: '0.03em',
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: '10px', color: 'rgba(239,83,80,0.90)', marginBottom: '10px', lineHeight: 1.5 }}>
            ⚠ {error}
          </div>
        )}
        {success && (
          <div style={{ fontSize: '10px', color: 'rgba(38,166,154,1)', marginBottom: '10px', letterSpacing: '0.06em' }}>
            ✓ LICENSE VALID — UNLOCKING...
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || success || !key.trim()}
          style={{
            width: '100%', height: '36px',
            background: success ? 'rgba(38,166,154,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${success ? 'rgba(38,166,154,0.50)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '4px',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '10px', fontWeight: 800,
            color: success ? 'rgba(38,166,154,1)' : 'rgba(255,255,255,0.70)',
            letterSpacing: '0.08em',
            cursor: loading || success || !key.trim() ? 'not-allowed' : 'pointer',
            opacity: !key.trim() && !loading ? 0.5 : 1,
          }}
        >
          {loading ? 'VERIFYING...' : success ? '✓ UNLOCKED' : 'UNLOCK ACCESS'}
        </button>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '9px', color: 'rgba(255,255,255,0.15)', lineHeight: 1.6 }}>
          Key tersimpan di device ini — tidak perlu input ulang.
        </div>
      </div>
    </div>
  );
});

LicenseModal.displayName = 'LicenseModal';

// ── ProLock — wrap komponen PRO dengan ini ────────────────────────────────────

interface ProLockProps {
  isPro:      boolean;
  onClickPro: () => void;
  children:   React.ReactNode;
  label?:     string;
}

export const ProLock: React.FC<ProLockProps> = React.memo(({ isPro, onClickPro, children, label }) => {
  if (isPro) return <>{children}</>;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div style={{ filter: 'blur(3px)', opacity: 0.30, height: '100%', pointerEvents: 'none' }}>
        {children}
      </div>
      <div
        onClick={onClickPro}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '10px', cursor: 'pointer',
          background: 'rgba(13,16,23,0.60)',
        }}
      >
        <div style={{ fontSize: '22px' }}>🔒</div>
        <div style={{
          fontSize: '10px', fontWeight: 800,
          color: 'rgba(255,255,255,0.80)', letterSpacing: '0.10em',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {label ?? 'PRO FEATURE'}
        </div>
        <div style={{
          padding: '6px 16px',
          background: 'rgba(242,142,44,0.15)',
          border: '1px solid rgba(242,142,44,0.40)',
          borderRadius: '3px',
          fontSize: '9px', fontWeight: 700,
          color: 'rgba(242,142,44,1)', letterSpacing: '0.08em',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          ⚡ UNLOCK $9
        </div>
      </div>
    </div>
  );
});

ProLock.displayName = 'ProLock';

export default LicenseModal;

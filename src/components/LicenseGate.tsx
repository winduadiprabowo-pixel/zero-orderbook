/**
 * LicenseGate.tsx — ZERØ ORDER BOOK
 * Full-screen modal yang minta Gumroad license key sebelum akses app.
 * Verify via CF Worker → Gumroad API. Key disimpan di localStorage.
 * rgba() only ✓ · IBM Plex Mono ✓ · React.memo ✓ · displayName ✓
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

interface LicenseGateProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'zerob_ob_license';
const PROXY_URL   = import.meta.env.VITE_PROXY_URL ?? 'https://zero-orderbook-proxy.winduadiprabowo.workers.dev';

// ── License Gate ──────────────────────────────────────────────────────────────

const LicenseGate: React.FC<LicenseGateProps> = React.memo(({ children }) => {
  const [unlocked, setUnlocked]   = useState(false);
  const [checked,  setChecked]    = useState(false);   // sudah cek localStorage?
  const [key,      setKey]        = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [success,  setSuccess]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Cek localStorage — kalau sudah pernah verify, langsung unlock
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUnlocked(true);
    }
    setChecked(true);
    return () => { mountedRef.current = false; };
  }, []);

  // Focus input kalau gate muncul
  useEffect(() => {
    if (checked && !unlocked) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [checked, unlocked]);

  const handleVerify = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Masukkan license key dari Gumroad.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${PROXY_URL}/verify-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: trimmed, product_id: 'atbwr' }),
      });

      const data = await res.json();

      if (!mountedRef.current) return;

      if (res.ok && data.success) {
        // Simpan ke localStorage — unlock permanen di device ini
        localStorage.setItem(STORAGE_KEY, trimmed);
        setSuccess(true);
        setTimeout(() => {
          if (mountedRef.current) setUnlocked(true);
        }, 800);
      } else {
        setError(data.message ?? 'License key tidak valid. Cek email Gumroad kamu.');
      }
    } catch {
      if (mountedRef.current) {
        setError('Gagal konek ke server. Coba lagi.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerify();
  }, [handleVerify]);

  // Belum selesai cek localStorage — render nothing (avoid flash)
  if (!checked) return null;

  // Sudah unlock — render app normal
  if (unlocked) return <>{children}</>;

  // Gate screen
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,12,18,1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"IBM Plex Mono", monospace',
      padding: '24px',
    }}>
      {/* Noise overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: '420px',
        background: 'rgba(16,19,28,1)',
        border: '1px solid rgba(242,142,44,0.25)',
        borderRadius: '6px',
        padding: '36px 32px 32px',
        boxShadow: '0 0 60px rgba(242,142,44,0.08), 0 0 0 1px rgba(255,255,255,0.04)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{
            fontSize: '22px', fontWeight: 800, letterSpacing: '0.04em',
            marginBottom: '6px',
          }}>
            <span style={{ color: 'rgba(242,142,44,1)' }}>ZERØ</span>
            <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 500, fontSize: '13px' }}>
              {' '}ORDER BOOK
            </span>
          </div>
          <div style={{
            fontSize: '10px', color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.12em', fontWeight: 500,
          }}>
            PRO ACCESS REQUIRED
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '28px' }} />

        {/* Instruction */}
        <p style={{
          fontSize: '11px', color: 'rgba(255,255,255,0.50)',
          lineHeight: 1.7, marginBottom: '20px', textAlign: 'center',
        }}>
          Masukkan license key dari email Gumroad kamu.
          <br />
          Belum punya?{' '}
          <a
            href="https://zerobuildlab.gumroad.com/l/atbwr"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(242,142,44,0.90)', textDecoration: 'none', fontWeight: 700 }}
          >
            Beli sekarang — $9 lifetime ↗
          </a>
        </p>

        {/* Input */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block', fontSize: '9px', fontWeight: 700,
            color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em',
            marginBottom: '8px',
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
            autoCorrect="off"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${error ? 'rgba(239,83,80,0.60)' : 'rgba(255,255,255,0.10)'}`,
              borderRadius: '4px',
              padding: '10px 12px',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '12px', fontWeight: 500,
              color: 'rgba(255,255,255,0.90)',
              letterSpacing: '0.04em',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => {
              if (!error) e.target.style.borderColor = 'rgba(242,142,44,0.50)';
            }}
            onBlur={e => {
              if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.10)';
            }}
          />
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            fontSize: '10px', color: 'rgba(239,83,80,0.90)',
            marginBottom: '12px', lineHeight: 1.5,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div style={{
            fontSize: '10px', color: 'rgba(38,166,154,1)',
            marginBottom: '12px', letterSpacing: '0.06em',
          }}>
            ✓ LICENSE VALID — UNLOCKING...
          </div>
        )}

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={loading || success || !key.trim()}
          style={{
            width: '100%', height: '40px',
            background: success
              ? 'rgba(38,166,154,0.20)'
              : 'rgba(242,142,44,0.15)',
            border: `1px solid ${success ? 'rgba(38,166,154,0.60)' : 'rgba(242,142,44,0.50)'}`,
            borderRadius: '4px',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '11px', fontWeight: 800,
            color: success ? 'rgba(38,166,154,1)' : 'rgba(242,142,44,1)',
            letterSpacing: '0.10em',
            cursor: loading || success || !key.trim() ? 'not-allowed' : 'pointer',
            opacity: !key.trim() && !loading ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'VERIFYING...' : success ? '✓ UNLOCKED' : 'UNLOCK ACCESS'}
        </button>

        {/* Footer */}
        <div style={{
          marginTop: '24px', textAlign: 'center',
          fontSize: '9px', color: 'rgba(255,255,255,0.18)',
          lineHeight: 1.6, letterSpacing: '0.05em',
        }}>
          Key tersimpan di device ini — tidak perlu input ulang.
          <br />
          Butuh bantuan?{' '}
          <a
            href="mailto:support@zerobuildlab.com"
            style={{ color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}
          >
            support@zerobuildlab.com
          </a>
        </div>
      </div>
    </div>
  );
});

LicenseGate.displayName = 'LicenseGate';

export default LicenseGate;

import { useState } from 'react';
import logo from '../assets/logo.svg';
import { Button, Card, Input } from '../design/components';
import { useAuth } from '../state/authContext';

type Mode = 'signin' | 'signup';

// Must match DEMO_EMAIL / DEMO_PASSWORD in backend/app/seed.py — that's what
// creates this account on first startup.
const DEMO_EMAIL = 'demo@bfxportfolio.cz';
const DEMO_PASSWORD = 'Ukazka2026';

export function SignIn() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'signup';

  const submit = async (overrideEmail?: string, overridePassword?: string) => {
    const emailToUse = overrideEmail ?? email;
    const passwordToUse = overridePassword ?? password;
    if (!emailToUse.trim()) {
      setError('Zadej e-mail.');
      return;
    }
    if (isSignUp && passwordToUse.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (!passwordToUse) {
      setError('Zadej heslo.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp(emailToUse.trim(), passwordToUse, displayName.trim());
      else await signIn(emailToUse.trim(), passwordToUse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přihlášení se nepodařilo.');
    } finally {
      setBusy(false);
    }
  };

  const signInAsDemo = () => {
    setMode('signin');
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    void submit(DEMO_EMAIL, DEMO_PASSWORD);
  };

  const switchMode = () => {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--surface-soft)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="" style={{ width: 32 }} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            BFX Portfolio Pro
          </span>
        </div>

        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 34,
              letterSpacing: '-0.5px',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {isSignUp ? 'Založit účet' : 'Přihlásit se'}
          </h1>
          <p style={{ color: 'var(--mute)', fontSize: 16, marginTop: 8, marginBottom: 0 }}>
            {isSignUp
              ? 'Data zůstávají na tvém serveru. Účet slouží jen k oddělení portfolií a přístupu.'
              : 'Evidence portfolia, watchlist a analýza jednotlivých titulů.'}
          </p>
        </div>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {isSignUp && (
              <Input
                label="Jméno"
                placeholder="Nepovinné"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            )}

            <Input
              label="E-mail"
              type="email"
              placeholder="jmeno@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Heslo"
              type="password"
              placeholder={isSignUp ? 'Alespoň 8 znaků' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <div
                style={{
                  color: 'var(--accent-danger-text)',
                  fontSize: 14,
                  lineHeight: 1.45,
                }}
              >
                {error}
              </div>
            )}

            <Button size="lg" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Pracuji…' : isSignUp ? 'Založit účet' : 'Přihlásit se'}
            </Button>

            <button
              type="button"
              onClick={switchMode}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--link)',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {isSignUp ? 'Už mám účet — přihlásit se' : 'Nemám účet — založit nový'}
            </button>
          </div>
        </Card>

        <div
          style={{
            border: '1px solid var(--hairline-light)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            background: 'var(--surface-soft)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            Chceš si to jen prohlédnout?
          </div>
          <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.5 }}>
            Demo účet má naplněné portfolio, watchlist, vlastní sekce i poznámky —{' '}
            <strong style={{ color: 'var(--ink)' }}>{DEMO_EMAIL}</strong> / heslo{' '}
            <strong style={{ color: 'var(--ink)' }}>{DEMO_PASSWORD}</strong>.
          </div>
          <button
            type="button"
            onClick={signInAsDemo}
            disabled={busy}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: busy ? 'default' : 'pointer',
              color: 'var(--link)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Přihlásit se demo účtem
          </button>
        </div>

        <p style={{ color: 'var(--ash)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Nástroj slouží k osobní evidenci. Neposkytuje investiční ani daňové poradenství.
          Výpočty jsou orientační a mohou obsahovat chyby v datech i zaokrouhlení.
        </p>
      </div>
    </div>
  );
}

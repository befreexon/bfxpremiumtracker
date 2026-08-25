import { useState } from 'react';
import logo from '../assets/logo.svg';
import { Button, Card, Input } from '../design/components';
import { useAuth } from '../state/authContext';

type Mode = 'signin' | 'signup';

export function SignIn() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'signup';

  const submit = async () => {
    if (!email.trim()) {
      setError('Zadej e-mail.');
      return;
    }
    if (isSignUp && password.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (!password) {
      setError('Zadej heslo.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp(email.trim(), password, displayName.trim());
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přihlášení se nepodařilo.');
    } finally {
      setBusy(false);
    }
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

            <Button size="lg" onClick={submit} disabled={busy}>
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

        <p style={{ color: 'var(--ash)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Nástroj slouží k osobní evidenci. Neposkytuje investiční ani daňové poradenství.
          Výpočty jsou orientační a mohou obsahovat chyby v datech i zaokrouhlení.
        </p>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { signInSchema, signUpSchema } from '@expense-tracker/shared';
import { signIn, signUp, useSession } from '../lib/auth-client.js';

type Mode = 'signIn' | 'signUp';

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>;

/**
 * Collects the first error per field. Zod reports every failing rule; showing
 * all of them under one input is noise.
 */
function collectFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const key = issue.path[0];
    if ((key === 'name' || key === 'email' || key === 'password') && !(key in errors)) {
      errors[key] = issue.message;
    }
  }

  return errors;
}

/**
 * Sign in / create account. The client-side Zod pass is purely so the user gets
 * an answer without a round trip — the server validates everything again and is
 * the only thing that decides whether credentials are good.
 */
export function LoginPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const state = location.state as { from?: string } | null;
  const from = state?.from ?? '/';

  // Already signed in — don't let the back button park someone on this form.
  if (!isPending && session) {
    return <Navigate to={from} replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed =
      mode === 'signUp'
        ? signUpSchema.safeParse({ name, email, password })
        : signInSchema.safeParse({ email, password });

    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error.issues));
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const { error } =
        mode === 'signUp'
          ? await signUp.email({ name: name.trim(), email, password })
          : await signIn.email({ email, password });

      if (error) {
        // Better Auth's message is deliberately vague for bad credentials, which
        // is what we want — don't dress it up into something more specific.
        setFormError(error.message ?? 'Something went wrong. Please try again.');
        return;
      }

      // `autoSignIn` means sign-up also lands here with a live session.
      void navigate(from, { replace: true });
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isSignUp = mode === 'signUp';

  return (
    <main>
      <h1>Expense Tracker</h1>
      <p className="muted">{isSignUp ? 'Create an account to get started.' : 'Sign in to continue.'}</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {isSignUp && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {fieldErrors.name && <p className="error">{fieldErrors.name}</p>}
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          {fieldErrors.email && <p className="error">{fieldErrors.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          {fieldErrors.password && <p className="error">{fieldErrors.password}</p>}
        </div>

        {formError && <p className="error">{formError}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="muted">
        {isSignUp ? 'Already have an account? ' : 'No account yet? '}
        <button
          type="button"
          className="link"
          onClick={() => {
            switchMode(isSignUp ? 'signIn' : 'signUp');
          }}
        >
          {isSignUp ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </main>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import { brand } from "@callme/ui/brand";
import { Button, Card, CardBody, Field, Input, cn } from "@callme/ui";
import {
  logIn,
  recoverAccount,
  signUp,
  type AuthResult,
} from "@/app/auth-actions";

/* -------------------------------------------------------------------------- */
/* Recovery code hand-off                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Shown exactly once. Only the hash is stored, so this really is unrecoverable
 * afterwards — the screen is blunt about that rather than burying it, because a
 * user who skims past this has no way back into their account.
 */
function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Card className="w-full max-w-md">
      <CardBody className="p-7">
        <div className="flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--warning-subtle)]">
          <KeyRound className="size-5 text-[var(--warning)]" aria-hidden />
        </div>

        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Save your recovery code
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          This is the only way back into your account if you forget your
          password. We store only a hash of it, so we can&rsquo;t show it again
          and we can&rsquo;t recover it for you.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
          <code className="flex-1 font-mono text-lg tracking-wider">{code}</code>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy recovery code"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked; the code is selectable on screen */
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          I&rsquo;ve saved this somewhere safe
        </label>

        <Button
          className="mt-6 w-full"
          size="lg"
          disabled={!acknowledged}
          onClick={onDone}
        >
          Continue
        </Button>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main id="main" className="relative grid min-h-dvh place-items-center px-5 py-12">
      <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          ← {brand.name}
        </Link>

        <Card>
          <CardBody className="p-7">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {subtitle}
            </p>
            {children}
          </CardBody>
        </Card>

        <p className="mt-5 text-center text-sm text-[var(--text-muted)]">
          {footer}
        </p>
      </div>
    </main>
  );
}

function FormError({ result }: { result: AuthResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-subtle)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {result.error}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Sign up                                                                     */
/* -------------------------------------------------------------------------- */

export function SignUpForm() {
  const router = useRouter();
  const [result, action, pending] = useActionState<AuthResult | null, FormData>(
    signUp,
    null,
  );

  if (result?.ok && result.recoveryCode) {
    return (
      <main className="relative grid min-h-dvh place-items-center px-5 py-12">
        <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <RecoveryCode
            code={result.recoveryCode}
            onDone={() => router.push("/chat")}
          />
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Keep your interests and reputation across devices. Email is optional — we use a recovery code instead."
      footer={
        <>
          Already have one?{" "}
          <Link href="/login" className="text-[var(--accent)] underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form action={action} className="mt-6 space-y-4">
        <Field
          label="Username"
          htmlFor="username"
          hint="Letters, numbers, underscores and hyphens"
          error={result && !result.ok && result.field === "username" ? result.error : null}
          required
        >
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            required
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 10 characters. A short phrase works well."
          error={result && !result.ok && result.field === "password" ? result.error : null}
          required
        >
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        {/* Only render the banner for errors not already attached to a field,
            so a single problem never appears twice. */}
        {result && !result.ok && !result.field ? <FormError result={result} /> : null}

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Create account
        </Button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-subtle)]">
        Your guest activity carries over — including your reputation. By
        continuing you accept our{" "}
        <Link href="/terms" className="underline underline-offset-2">terms</Link>.
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Log in                                                                      */
/* -------------------------------------------------------------------------- */

export function LogInForm() {
  const [result, action, pending] = useActionState<AuthResult | null, FormData>(
    logIn,
    null,
  );

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="text-[var(--accent)] underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <form action={action} className="mt-6 space-y-4">
        <Field label="Username" htmlFor="username" required>
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <FormError result={result} />

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Log in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link href="/recover" className="text-[var(--text-muted)] underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Recover                                                                     */
/* -------------------------------------------------------------------------- */

export function RecoverForm() {
  const router = useRouter();
  const [result, action, pending] = useActionState<AuthResult | null, FormData>(
    recoverAccount,
    null,
  );

  if (result?.ok && result.recoveryCode) {
    return (
      <main className="relative grid min-h-dvh place-items-center px-5 py-12">
        <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          {/* A used code is burned, so recovery immediately issues a new one. */}
          <RecoveryCode
            code={result.recoveryCode}
            onDone={() => router.push("/chat")}
          />
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      title="Recover your account"
      subtitle="Enter the recovery code you saved when you signed up, and choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="text-[var(--accent)] underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form action={action} className="mt-6 space-y-4">
        <Field label="Username" htmlFor="username" required>
          <Input name="username" autoComplete="username" autoCapitalize="none" required />
        </Field>

        <Field
          label="Recovery code"
          htmlFor="code"
          hint="Looks like K3M7Q-8XZ2R-VN4TP"
          error={result && !result.ok && result.field === "code" ? result.error : null}
          required
        >
          <Input
            name="code"
            className={cn("font-mono uppercase tracking-wider")}
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </Field>

        <Field
          label="New password"
          htmlFor="password"
          hint="At least 10 characters"
          error={result && !result.ok && result.field === "password" ? result.error : null}
          required
        >
          <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>

        {result && !result.ok && !result.field ? <FormError result={result} /> : null}

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Reset password
        </Button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-subtle)]">
        Resetting signs you out everywhere else. If someone else had access to
        your account, this is what removes it.
      </p>
    </AuthShell>
  );
}

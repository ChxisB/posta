import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-primary)',
    }}>
      <SignIn
        appearance={{
          elements: {
            rootBox: { width: '100%', maxWidth: 400 },
            card: {
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'none',
            },
            headerTitle: { color: 'var(--color-accent)' },
            headerSubtitle: { color: 'var(--color-text-muted)' },
            formFieldLabel: { color: 'var(--color-text-muted)' },
            formFieldInput: {
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            },
            formButtonPrimary: {
              background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
              border: 'none',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            },
            footerActionText: { color: 'var(--color-text-muted)' },
            footerActionLink: { color: 'var(--color-accent)' },
            socialButtonsBlockButton: {
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            },
          },
        }}
      />
    </div>
  );
}

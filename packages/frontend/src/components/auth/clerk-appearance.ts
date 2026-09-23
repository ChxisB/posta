/**
 * Styles Clerk's <SignIn> and <SignUp> with Posta's own theme tokens so the
 * auth pages follow light and dark mode like the rest of the app.
 *
 * Inline style objects rather than Clerk's `variables`, because these are
 * CSS custom properties that change with data-theme; `elements` passes them
 * straight through to the DOM where they resolve at paint time.
 */
export const clerkAppearance = {
  elements: {
    rootBox: { width: '100%' },
    cardBox: {
      width: '100%',
      maxWidth: '100%',
      border: '1px solid var(--c-line)',
      borderRadius: 16,
      boxShadow: 'var(--c-shadow-elev-md)',
    },
    card: { background: 'var(--c-panel)', boxShadow: 'none' },
    headerTitle: { color: 'var(--c-foreground)' },
    headerSubtitle: { color: 'var(--c-muted)' },
    formFieldLabel: { color: 'var(--c-foreground)' },
    formFieldInput: {
      background: 'var(--c-background)',
      borderColor: 'var(--c-line)',
      color: 'var(--c-foreground)',
    },
    otpCodeFieldInput: { borderColor: 'var(--c-line)', color: 'var(--c-foreground)' },
    formButtonPrimary: {
      background: 'var(--c-accent)',
      color: 'var(--c-accent-ink)',
      boxShadow: 'none',
    },
    footer: { background: 'var(--c-panel-2)' },
    footerActionText: { color: 'var(--c-muted)' },
    footerActionLink: { color: 'var(--c-accent)' },
    identityPreviewText: { color: 'var(--c-foreground)' },
    identityPreviewEditButton: { color: 'var(--c-accent)' },
    formResendCodeLink: { color: 'var(--c-accent)' },
    socialButtonsBlockButton: {
      background: 'var(--c-panel)',
      borderColor: 'var(--c-line)',
      color: 'var(--c-foreground)',
    },
    socialButtonsBlockButtonText: { color: 'var(--c-foreground)' },
    dividerLine: { background: 'var(--c-line)' },
    dividerText: { color: 'var(--c-faint)' },
  },
};

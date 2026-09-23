/**
 * Styles Clerk's <SignIn> and <SignUp> with Posta's own theme tokens so the
 * auth pages follow light and dark mode like the rest of the app.
 *
 * Inline style objects rather than Clerk's `variables`, because these are
 * CSS custom properties that change with data-theme; `elements` passes them
 * straight through to the DOM where they resolve at paint time.
 *
 * The card is flattened into the page: the auth pages frame the form
 * themselves (AuthSplit), and a bordered card inside that frame reads as a
 * box in a box. Clerk's header on the first step is hidden in globals.css,
 * because the page's own heading already says the same thing.
 */
export const clerkAppearance = {
  variables: { borderRadius: '0.625rem', fontFamily: 'inherit' },
  elements: {
    rootBox: { width: '100%' },
    cardBox: {
      width: '100%',
      maxWidth: '100%',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      background: 'transparent',
    },
    card: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 },
    headerTitle: { color: 'var(--c-foreground)' },
    headerSubtitle: { color: 'var(--c-muted)' },
    formFieldLabel: { color: 'var(--c-foreground)', fontWeight: 500 },
    formFieldInput: {
      height: 40,
      background: 'var(--c-panel)',
      borderColor: 'var(--c-line)',
      color: 'var(--c-foreground)',
    },
    otpCodeFieldInput: { borderColor: 'var(--c-line)', color: 'var(--c-foreground)' },
    formButtonPrimary: {
      height: 40,
      background: 'var(--c-accent)',
      color: 'var(--c-accent-ink)',
      fontSize: 14,
      fontWeight: 600,
      boxShadow: 'var(--c-shadow-elev-sm)',
    },
    footer: { background: 'transparent', padding: 0, marginTop: 8 },
    footerAction: { justifyContent: 'flex-start', padding: '12px 0 0' },
    footerActionText: { color: 'var(--c-muted)' },
    footerActionLink: { color: 'var(--c-accent)', fontWeight: 600 },
    identityPreviewText: { color: 'var(--c-foreground)' },
    identityPreviewEditButton: { color: 'var(--c-accent)' },
    formResendCodeLink: { color: 'var(--c-accent)' },
    socialButtonsBlockButton: {
      height: 40,
      background: 'var(--c-panel)',
      borderColor: 'var(--c-line)',
      color: 'var(--c-foreground)',
      boxShadow: 'var(--c-shadow-elev-sm)',
    },
    socialButtonsBlockButtonText: { color: 'var(--c-foreground)' },
    dividerLine: { background: 'var(--c-line)' },
    dividerText: { color: 'var(--c-faint)' },
  },
};

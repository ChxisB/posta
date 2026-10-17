// The words and markup of the demo workspace: every address is on a reserved
// example/test domain, so nothing here can reach a real person.

export const DEMO_SENDER_DOMAIN = "mail.acme.test";
export const DEMO_PENDING_DOMAIN = "news.acme.test";

export const FIRST_NAMES = [
  "Ava",
  "Noah",
  "Mia",
  "Liam",
  "Zoe",
  "Ethan",
  "Isla",
  "Lucas",
  "Nora",
  "Leo",
  "Ruby",
  "Owen",
  "Ivy",
  "Felix",
  "Maya",
  "Jonas",
  "Elena",
  "Mateo",
  "Priya",
  "Kenji",
  "Amara",
  "Tomas",
  "Sofia",
  "Idris",
] as const;

export const LAST_NAMES = [
  "Hart",
  "Okafor",
  "Lindqvist",
  "Moreau",
  "Tanaka",
  "Singh",
  "Rossi",
  "Novak",
  "Haddad",
  "Brennan",
  "Silva",
  "Kowalski",
  "Nakamura",
  "Duarte",
  "Fischer",
  "Adeyemi",
] as const;

export const COMPANIES = [
  "Northwind",
  "Lumen Labs",
  "Fernhill",
  "Parcel",
  "Quill & Co",
  "Basalt",
  "Tidewater",
  "Orbit Works",
  "Kestrel",
  "Moss",
] as const;

export const COUNTRIES = ["US", "GB", "DE", "BR", "CA", "FR", "JP", "AU"] as const;
export const CONTACT_PLANS = ["free", "starter", "team", "enterprise"] as const;
export const CONTACT_DOMAINS = ["example.com", "example.org", "example.net"] as const;

const BRAND = "#7046E8";

function page(opts: { heading: string; body: string[]; cta?: { label: string; href: string } }) {
  const paragraphs = opts.body
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46">${p}</p>`)
    .join("");
  const button = opts.cta
    ? `<p style="margin:24px 0"><a href="${opts.cta.href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px">${opts.cta.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px"><tr><td><h1 style="margin:0 0 20px;font-size:22px;color:#18181b">${opts.heading}</h1>${paragraphs}${button}<p style="margin:24px 0 0;font-size:12px;color:#71717a">Acme, 1 Example Street. <a href="https://acme.test/unsubscribe" style="color:#71717a">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>`;
}

export interface DemoTemplate {
  name: string;
  alias: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
  /** A one-line subject used by the oldest published version. */
  firstSubject: string;
  versions: number;
}

export const TEMPLATES: DemoTemplate[] = [
  {
    name: "Welcome",
    alias: "welcome",
    subject: "Welcome to Acme",
    firstSubject: "Welcome!",
    previewText: "Your workspace is ready",
    versions: 3,
    html: page({
      heading: "Welcome to Acme",
      body: ["Your workspace is ready. Invite your team and connect your first project."],
      cta: { label: "Open your workspace", href: "https://acme.test/app" },
    }),
    text: "Welcome to Acme. Your workspace is ready: https://acme.test/app",
  },
  {
    name: "Password reset",
    alias: "password-reset",
    subject: "Reset your password",
    firstSubject: "Password reset",
    previewText: "This link expires in 30 minutes",
    versions: 2,
    html: page({
      heading: "Reset your password",
      body: ["Use the button below to choose a new password. The link expires in 30 minutes."],
      cta: { label: "Choose a new password", href: "https://acme.test/reset" },
    }),
    text: "Reset your password: https://acme.test/reset (expires in 30 minutes)",
  },
  {
    name: "Receipt",
    alias: "receipt",
    subject: "Your receipt from Acme",
    firstSubject: "Receipt",
    previewText: "Thanks for your payment",
    versions: 2,
    html: page({
      heading: "Thanks for your payment",
      body: ["We received your payment. Your receipt is attached to your account."],
      cta: { label: "View receipt", href: "https://acme.test/billing" },
    }),
    text: "Thanks for your payment. View your receipt: https://acme.test/billing",
  },
  {
    name: "Monthly newsletter",
    alias: "newsletter",
    subject: "What shipped this month",
    firstSubject: "Monthly update",
    previewText: "Three things worth a look",
    versions: 4,
    html: page({
      heading: "What shipped this month",
      body: [
        "Faster exports, a cleaner activity feed and a new Slack integration.",
        "Here is what changed and why.",
      ],
      cta: { label: "Read the changelog", href: "https://acme.test/changelog" },
    }),
    text: "What shipped this month: https://acme.test/changelog",
  },
  {
    name: "Product launch",
    alias: "product-launch",
    subject: "Meet Acme Insights",
    firstSubject: "Launch day",
    previewText: "See how your team uses Acme",
    versions: 2,
    html: page({
      heading: "Meet Acme Insights",
      body: ["See how your team uses Acme, with usage you can filter by project and person."],
      cta: { label: "Try Insights", href: "https://acme.test/insights" },
    }),
    text: "Meet Acme Insights: https://acme.test/insights",
  },
  {
    name: "Sign-in code",
    alias: "sign-in-code",
    subject: "Your sign-in code",
    firstSubject: "Your code",
    previewText: "Use this code to sign in",
    versions: 1,
    html: page({
      heading: "Your sign-in code",
      body: ["Enter this code to finish signing in. It is valid for ten minutes."],
    }),
    text: "Your sign-in code is 482913. It is valid for ten minutes.",
  },
];

export interface TransactionalKind {
  subject: string;
  weight: number;
  tags: Record<string, string>;
  template: string;
  link: string;
}

export const TRANSACTIONAL_KINDS: TransactionalKind[] = [
  {
    subject: "Your sign-in code",
    weight: 30,
    tags: { category: "auth" },
    template: "sign-in-code",
    link: "https://acme.test/app",
  },
  {
    subject: "Reset your password",
    weight: 10,
    tags: { category: "auth" },
    template: "password-reset",
    link: "https://acme.test/reset",
  },
  {
    subject: "Welcome to Acme",
    weight: 18,
    tags: { category: "onboarding" },
    template: "welcome",
    link: "https://acme.test/app",
  },
  {
    subject: "Your receipt from Acme",
    weight: 20,
    tags: { category: "billing" },
    template: "receipt",
    link: "https://acme.test/billing",
  },
  {
    subject: "Your export is ready",
    weight: 12,
    tags: { category: "product" },
    template: "welcome",
    link: "https://acme.test/exports",
  },
  {
    subject: "New comment on your project",
    weight: 10,
    tags: { category: "product" },
    template: "welcome",
    link: "https://acme.test/projects",
  },
];

export const BROADCASTS = {
  sent: {
    name: "October product update",
    subject: "What shipped this month",
    previewText: "Three things worth a look",
    template: "newsletter",
  },
  scheduled: {
    name: "Black Friday early access",
    subject: "Early access starts Monday",
    previewText: "A week before everyone else",
    template: "product-launch",
  },
  draft: {
    name: "Winter roadmap preview",
    subject: "What we are building this winter",
    previewText: "A first look",
    template: "newsletter",
  },
} as const;

export const INBOUND_SUBJECTS = [
  "Re: Your invoice",
  "Question about the API",
  "Can you add me to the beta?",
  "Meeting notes from Tuesday",
  "Your verification code",
  "Delivery failure notice",
  "Partnership idea",
  "Feedback on the new dashboard",
] as const;

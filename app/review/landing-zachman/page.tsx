'use client';

import Link from 'next/link';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

const MONO = { fontFamily: 'monospace' } as const;

const CONTAINER = 'max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8';
const SECTION = 'py-16 md:py-20 lg:py-24';
const SECTION_MUTED = cn(SECTION, 'bg-muted');
const SECTION_TITLE =
  'text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2';
const SECTION_HEADING = 'text-3xl md:text-4xl font-bold tracking-tight mb-4';
const SECTION_SUB = 'text-muted-foreground text-lg max-w-2xl';

const CARD_BRUTAL = 'border-2 border-border/50 rounded-xl';
const CARD_ACCENT = 'border-2 border-accent/50 bg-accent/5 rounded-xl';

/* ---------------------------------------------------------------------------
 * Data — Progressive Disclosure Architecture
 *
 * Layer 1: Foundation (Hero)
 * Layer 2: Workflows — what it helps you do
 * Layer 3: Evidence — proof surfaces
 * Layer 4: Properties — why to trust it
 * --------------------------------------------------------------------------- */

/** S2 — Workflows: the 6 canonical operations from Zachman SoT */
const WORKFLOWS = [
  {
    id: 1,
    verb: 'Cover the floor',
    description:
      'Casino-wide shift dashboard with live KPIs, coverage quality by table, win/loss trends, and mid-shift checkpoints that track how performance changes in real time.',
  },
  {
    id: 2,
    verb: 'Track sessions',
    description:
      'Check players in, assign tables, manage visits across breaks and table moves. Session continuation preserves the full picture even when players move around the floor.',
  },
  {
    id: 3,
    verb: 'Rate play',
    description:
      'Create, pause, resume, and close rating slips with auto-calculated play duration. Average bet capture feeds theoretical win computation. Table moves carry the session forward.',
  },
  {
    id: 4,
    verb: 'Manage cash activity',
    description:
      'Record buy-ins with live compliance threshold feedback. Process cash-outs and voids with audit trail. Confirm fills and credits with discrepancy notes. Every dollar attributed.',
  },
  {
    id: 5,
    verb: 'Manage players',
    description:
      'Instant search, full Player 360 profiles, enrollment, identity verification, and exclusion management. Import entire player databases from legacy systems via supervised CSV upload.',
  },
  {
    id: 6,
    verb: 'Stay compliant',
    description:
      'MTL entries with progressive threshold tracking, CTR alerts at regulatory boundaries, per-patron daily cash aggregates, audit notes, and printable compliance records. During the shift, not after.',
  },
];

/** S3 — Evidence: proof surfaces (rebalanced per Reality Map) */
const EVIDENCE = [
  {
    id: 1,
    title: 'Shift dashboard with checkpoint delta',
    description:
      'Live floor picture — active tables, open sessions, cash activity, shift KPIs. Take mid-shift snapshots and track exactly how performance changes. No legacy system does this.',
    label: 'SHIFT_DASHBOARD.tsx',
  },
  {
    id: 2,
    title: 'Player 360',
    description:
      'Complete player profile: identity, visit history, rating slips, financial summary, loyalty tier and ledger, filterable interaction timeline. One screen replaces the binder.',
    label: 'PLAYER_360.tsx',
  },
  {
    id: 3,
    title: 'Cash accountability with threshold feedback',
    description:
      'Buy-in recording shows live proximity to compliance thresholds as the number is entered. Progressive MTL alerts at $3K, CTR banner at $10K. The strongest Title 31 proof point.',
    label: 'CASH_THRESHOLD.tsx',
  },
  {
    id: 4,
    title: 'Setup wizard and player import',
    description:
      'Register a property, configure games and tables, set alert thresholds, invite staff — operational in one session. Then import thousands of player records via CSV with column mapping, validation, and batch processing.',
    label: 'SETUP_WIZARD.tsx',
  },
];

/** S4 — Properties: canonical trust attributes from Zachman SoT */
const PROPERTIES = [
  {
    id: 1,
    statement: 'Every number is traceable',
    proof:
      'Permanent financial records, permanent loyalty ledger, audit notes with timestamps on every mutation. Cash transactions, rating slip financials, and loyalty entries are append-only.',
  },
  {
    id: 2,
    statement: 'Every action is attributed',
    proof:
      'Staff identity attached to every operation — buy-ins, cash-outs, rating changes, comp issuances, compliance entries. Four roles with database-level access control. No shared logins.',
  },
  {
    id: 3,
    statement: 'Nothing gets rewritten',
    proof:
      'Corrections create new records with full lineage. Cash-out voids require a reason and audit note. The original entry is preserved. The record is the record.',
  },
  {
    id: 4,
    statement: 'Anomalies surface during operations',
    proof:
      'Live buy-in threshold feedback as the number is entered. Progressive MTL alerts at $3,000. CTR banner at $10,000. Shift checkpoint deltas show change, not just state. During the shift, not in the morning report.',
  },
];

/** S5 — Pricing (unchanged from other variants) */
const PRICING_FEATURES = [
  'Shift dashboard and floor overview',
  'Player profiles and visit tracking',
  'Rating slips and theoretical win',
  'Cash activity and threshold monitoring',
  'Loyalty points and rewards',
  'Compliance dashboard and audit trail',
  'Role-based access control',
  'Guided setup wizard and player import',
  'Ongoing updates and support',
];

/** S6 — FAQ: rewritten for progressive disclosure */
const FAQ_ITEMS = [
  {
    q: 'What does Player Tracker replace?',
    a: 'Legacy table games systems — paper rating slips, standalone tracking software, spreadsheets, and manual logs. It becomes your system of record for player sessions, ratings, cash activity, loyalty, and compliance.',
  },
  {
    q: 'Who is this built for?',
    a: 'Owner-operators, GMs, and operations leads at small card rooms and similar gaming properties. If you run a floor and feel limited by your current tools, this is built for how you actually work.',
  },
  {
    q: 'How long does setup take?',
    a: 'The guided setup wizard configures your property — areas, tables, games, staff roles — in a single session. Player data import from your existing system is a separate step with supervised CSV upload, column mapping, and validation.',
  },
  {
    q: 'Can I import player data from my current system?',
    a: 'Yes. The import tool handles CSV files from common vendor formats. Records are previewed, validated, and classified by match confidence before being applied. You review everything before it goes live.',
  },
  {
    q: 'Is this a compliance product?',
    a: 'No. It is an operations platform with compliance built into the architecture. Audit trails, threshold monitoring, staff attribution, and immutable records are structural — they support your compliance program, they do not replace it.',
  },
  {
    q: 'What about pricing?',
    a: 'One product, one price per property. No tiers, no per-seat fees, no module add-ons. Every property gets the full platform. Contact us for property-specific pricing.',
  },
  {
    q: 'Do I need to talk to someone before I can use it?',
    a: 'A short walkthrough is recommended so we can configure the system for your floor. Self-serve access is available if you prefer to explore on your own.',
  },
];

/* ---------------------------------------------------------------------------
 * Component
 * --------------------------------------------------------------------------- */

export default function LandingZachmanPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ===== HEADER ===== */}
      <header className="border-b-2 border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div
          className={cn(CONTAINER, 'flex items-center justify-between h-16')}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-2.5 h-2.5 rounded-full bg-accent"
              style={{ boxShadow: '0 0 8px rgba(8,145,178,0.5)' }}
            />
            <span
              className="text-sm font-bold uppercase tracking-widest text-foreground"
              style={MONO}
            >
              Player Tracker
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {[
              { label: 'Operations', href: '#workflows' },
              { label: 'Product', href: '#evidence' },
              { label: 'Trust', href: '#properties' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'FAQ', href: '#faq' },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                style={MONO}
              >
                {item.label}
              </a>
            ))}
            <Button
              asChild
              size="sm"
              className="text-xs font-semibold uppercase tracking-wider"
            >
              <Link href="/contact">Request a Demo</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ===== S1: HERO — FOUNDATION LAYER ===== */}
      {/* What is this? Identity statement, not comparison. */}
      <section className={SECTION}>
        <div className={CONTAINER}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-xl">
              {/* Category label */}
              <Badge className="bg-accent/10 text-accent border-accent/30 mb-6 text-xs uppercase tracking-wider">
                System of Record for Table-Game Operations
              </Badge>

              {/* Identity headline — what it IS */}
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6"
                style={MONO}
              >
                One operating surface
                <br />
                for the casino floor.
              </h1>

              {/* Subhead — operational scope expansion */}
              <p className={cn(SECTION_SUB, 'mb-8')}>
                Floor coverage, player tracking, session rating, cash
                accountability, loyalty, and compliance — unified in one
                attributable, traceable system.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  asChild
                  size="lg"
                  className="text-xs font-semibold uppercase tracking-wider"
                >
                  <Link href="/contact">Request a Demo</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="text-xs font-semibold uppercase tracking-wider border-2"
                >
                  <a href="#workflows">See How It Works</a>
                </Button>
              </div>

              {/* Tertiary self-serve link */}
              <p className="mt-4 text-xs text-muted-foreground">
                Already ready to explore?{' '}
                <Link
                  href="/start"
                  className="text-accent hover:underline font-medium"
                >
                  Start setup
                </Link>
              </p>

              {/* Proof strip — hero-adjacent trust layer */}
              <div className="mt-10 flex flex-wrap items-center gap-6">
                {[
                  'Traceable numbers',
                  'Attributed actions',
                  'Compliance-aware workflows',
                ].map((signal) => (
                  <div
                    key={signal}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    style={MONO}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"
                      style={{
                        boxShadow: '0 0 6px rgba(8,145,178,0.4)',
                      }}
                    />
                    <span className="uppercase tracking-wider font-semibold">
                      {signal}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero visual — screenshot placeholder */}
            <div className="hidden lg:block">
              <Card className={CARD_ACCENT}>
                <CardContent className="flex items-center justify-center py-32">
                  <div className="text-center">
                    <p
                      className="text-xs font-bold uppercase tracking-widest text-accent/70 mb-1"
                      style={MONO}
                    >
                      SHIFT_DASHBOARD.tsx
                    </p>
                    <div className="border-2 border-dashed border-accent/30 rounded-lg px-8 py-4 mt-3">
                      <p
                        className="text-[10px] uppercase tracking-widest text-accent/50"
                        style={MONO}
                      >
                        Shift Dashboard Screenshot
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ===== S2: WORKFLOWS — WHAT IT HELPS YOU DO ===== */}
      {/* 6 canonical operations from Zachman SoT. Stated as operational */}
      {/* activities, not benefits and not features. */}
      <section className={SECTION_MUTED} id="workflows">
        <div className={CONTAINER}>
          <p className={SECTION_TITLE} style={MONO}>
            Operations
          </p>
          <h2 className={SECTION_HEADING} style={MONO}>
            Cover the floor. Track play. Capture cash. Stay compliant.
          </h2>
          <p className={cn(SECTION_SUB, 'mb-12')}>
            Six operational workflows, unified in one system. Each one maps to
            what your floor team already does — this is how they do it with
            complete attribution and traceability.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKFLOWS.map((wf) => (
              <Card key={wf.id} className={CARD_BRUTAL}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className="text-xs font-bold text-muted-foreground uppercase tracking-widest"
                      style={MONO}
                    >
                      {String(wf.id).padStart(2, '0')}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <CardTitle
                    className="text-sm font-bold uppercase tracking-widest"
                    style={MONO}
                  >
                    {wf.verb}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {wf.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== S3: EVIDENCE — PROOF SURFACES ===== */}
      {/* Show, don't tell. Rebalanced to promote undersold capabilities. */}
      <section className={SECTION} id="evidence">
        <div className={CONTAINER}>
          <p className={SECTION_TITLE} style={MONO}>
            Product
          </p>
          <h2 className={SECTION_HEADING} style={MONO}>
            What it looks like in operation.
          </h2>
          <p className={cn(SECTION_SUB, 'mb-12')}>
            Four operational surfaces. Each one built for the person who
            actually uses it, under shift pressure.
          </p>

          <div className="space-y-6">
            {EVIDENCE.map((item, i) => (
              <Card key={item.id} className={CARD_BRUTAL}>
                <CardContent className="p-0">
                  <div
                    className={cn(
                      'grid grid-cols-1 lg:grid-cols-2 gap-0',
                      i % 2 === 1 && 'lg:[&>*:first-child]:order-2',
                    )}
                  >
                    {/* Text column */}
                    <div className="p-6 lg:p-8 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className="text-xs font-bold text-muted-foreground uppercase tracking-widest"
                          style={MONO}
                        >
                          {String(item.id).padStart(2, '0')}
                        </span>
                        <div className="h-px flex-1 bg-border/50" />
                      </div>
                      <h3
                        className="text-sm font-bold uppercase tracking-widest mb-3"
                        style={MONO}
                      >
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Screenshot placeholder column */}
                    <div className="bg-accent/5 border-t-2 lg:border-t-0 lg:border-l-2 border-accent/20 flex items-center justify-center py-16 lg:py-20">
                      <div className="text-center">
                        <p
                          className="text-xs font-bold uppercase tracking-widest text-accent/70 mb-1"
                          style={MONO}
                        >
                          {item.label}
                        </p>
                        <div className="border-2 border-dashed border-accent/30 rounded-lg px-8 py-4 mt-3">
                          <p
                            className="text-[10px] uppercase tracking-widest text-accent/50"
                            style={MONO}
                          >
                            Screenshot Placeholder
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== S4: PROPERTIES — WHY TO TRUST IT ===== */}
      {/* Structural attributes, not feature list. Compliance absorbed here. */}
      <section className={SECTION_MUTED} id="properties">
        <div className={CONTAINER}>
          <p className={SECTION_TITLE} style={MONO}>
            Trust
          </p>
          <h2 className={SECTION_HEADING} style={MONO}>
            Compliance built in, not bolted on.
          </h2>
          <p className={cn(SECTION_SUB, 'mb-12')}>
            These are structural properties of the system — not features you
            enable, not modules you purchase. They are how the data model works.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PROPERTIES.map((prop) => (
              <Card key={prop.id} className={CARD_BRUTAL}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className="w-2 h-2 rounded-full bg-accent flex-shrink-0"
                      style={{
                        boxShadow: '0 0 8px rgba(8,145,178,0.5)',
                      }}
                    />
                    <span
                      className="text-xs font-bold text-muted-foreground uppercase tracking-widest"
                      style={MONO}
                    >
                      {String(prop.id).padStart(2, '0')}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <CardTitle
                    className="text-sm font-bold uppercase tracking-widest"
                    style={MONO}
                  >
                    {prop.statement}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {prop.proof}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== S5: PRICING TEASER ===== */}
      <section className={SECTION} id="pricing">
        <div className={CONTAINER}>
          <div className="max-w-2xl mx-auto text-center">
            <p className={cn(SECTION_TITLE, 'text-center')} style={MONO}>
              Pricing
            </p>
            <h2 className={cn(SECTION_HEADING, 'text-center')} style={MONO}>
              One product. One price per property.
            </h2>
            <p className={cn(SECTION_SUB, 'mx-auto text-center mb-12')}>
              No tiers. No modules. No per-seat fees. Every property gets the
              full platform.
            </p>
          </div>

          <Card className={cn(CARD_BRUTAL, 'max-w-2xl mx-auto')}>
            <CardHeader className="text-center border-b-2 border-border/30">
              <Badge className="bg-accent/10 text-accent border-accent/30 text-xs uppercase tracking-wider w-fit mx-auto mb-2">
                All-Inclusive
              </Badge>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={MONO}
              >
                Per-Property License
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {PRICING_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"
                      style={{
                        boxShadow: '0 0 6px rgba(8,145,178,0.4)',
                      }}
                    />
                    <span className="text-sm text-foreground" style={MONO}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 text-center">
                <Button
                  asChild
                  size="lg"
                  className="text-xs font-semibold uppercase tracking-wider w-full sm:w-auto"
                >
                  <Link href="/contact">Talk to Us About Pricing</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===== S6: FAQ ===== */}
      <section className={SECTION_MUTED} id="faq">
        <div className={CONTAINER}>
          <div className="max-w-2xl mx-auto">
            <p className={SECTION_TITLE} style={MONO}>
              FAQ
            </p>
            <h2 className={cn(SECTION_HEADING, 'mb-8')} style={MONO}>
              Common questions.
            </h2>

            <Accordion type="single" collapsible className="space-y-2">
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`faq-${index}`}
                  className="border-2 border-border/50 rounded-xl px-4 data-[state=open]:border-accent/50 transition-colors"
                >
                  <AccordionTrigger
                    className="text-sm font-bold uppercase tracking-wider hover:no-underline"
                    style={MONO}
                  >
                    <span className="flex items-center gap-3 text-left">
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {item.q}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ===== S7: FINAL CTA — OUTCOME-ANCHORED CLOSE ===== */}
      {/* The canonical outcome line lands here, not in the hero. */}
      <section className={SECTION}>
        <div className={CONTAINER}>
          <div className="max-w-2xl mx-auto text-center">
            {/* Outcome line — the Zachman canonical close */}
            <h2
              className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4"
              style={MONO}
            >
              Numbers you can stand behind.
            </h2>
            <p className={cn(SECTION_SUB, 'mx-auto text-center mb-8')}>
              Talk to us about your floor. We&apos;ll walk through how Player
              Tracker fits your property — your tables, your workflows, your
              operation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="text-xs font-semibold uppercase tracking-wider"
              >
                <Link href="/contact">Book a Walkthrough</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="text-xs font-semibold uppercase tracking-wider border-2"
              >
                <a href="#pricing">See Pricing</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t-2 border-border/50">
        <div className={cn(CONTAINER, 'py-8')}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full bg-accent"
                style={{ boxShadow: '0 0 8px rgba(8,145,178,0.5)' }}
              />
              <span
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={MONO}
              >
                Player Tracker
              </span>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: 'Privacy', href: '#' },
                { label: 'Terms', href: '#' },
                { label: 'Contact', href: '/contact' },
                { label: 'Sign in', href: '/signin' },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
                  style={MONO}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <p
              className="text-xs text-muted-foreground uppercase tracking-wider"
              style={MONO}
            >
              &copy; 2026 Player Tracker
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

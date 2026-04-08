'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

import { BankModeSelector } from '../../(onboarding)/setup/components/bank-mode-selector';
import { GameSettingsForm } from '../../(onboarding)/setup/components/game-settings-form';
import { ParEntryRow } from '../../(onboarding)/setup/components/par-entry-row';
import { TableRowForm } from '../../(onboarding)/setup/components/table-row-form';
import type { TableFormRow } from '../../(onboarding)/setup/components/table-row-form';
import { WizardStepper } from '../../(onboarding)/setup/components/wizard-stepper';
import { StepCasinoBasics } from '../../(onboarding)/setup/steps/step-casino-basics';
import { StepCreateTables } from '../../(onboarding)/setup/steps/step-create-tables';
import { StepParTargets } from '../../(onboarding)/setup/steps/step-par-targets';
import { StepReviewComplete } from '../../(onboarding)/setup/steps/step-review-complete';

import {
  MOCK_CASINO_SETTINGS,
  MOCK_GAME_SETTINGS,
  MOCK_GAMING_TABLES,
  MOCK_INVITES,
} from './mock-data';

// ============================================================
// Section navigation
// ============================================================

const SECTIONS = [
  'Register',
  'Bootstrap',
  'Invite / Manage',
  'Invite / Accept',
  'Setup Wizard',
] as const;

type SectionId = (typeof SECTIONS)[number];

// ============================================================
// Onboarding Layout Wrapper (mirrors the real layout)
// ============================================================

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 bg-background">
      {/* PT-2 Branding Mark */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-8 w-8 rounded border-2 border-accent/50 bg-accent/10 flex items-center justify-center">
          <span
            className="text-sm font-bold text-accent"
            style={{ fontFamily: 'monospace' }}
          >
            PT
          </span>
        </div>
        <span
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Pit Station
        </span>
      </div>

      <div className="w-full max-w-3xl px-6">{children}</div>

      {/* Footer */}
      <div className="mt-12">
        <p
          className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40"
          style={{ fontFamily: 'monospace' }}
        >
          Casino Pit Management System
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Section: Register Company
// ============================================================

function RegisterSection() {
  return (
    <OnboardingShell>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Register Your Company
          </h1>
          <p className="text-sm text-muted-foreground">
            Tell us about your company before setting up your first casino.
          </p>
        </div>

        <Card className="border-2 border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Company Details
            </CardTitle>
            <CardDescription>
              Enter your company information to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="review-company_name"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Company Name
                </Label>
                <Input
                  id="review-company_name"
                  placeholder="e.g. Acme Gaming Corp"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="review-legal_name"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Legal Company Name (optional)
                </Label>
                <Input
                  id="review-legal_name"
                  placeholder="e.g. Acme Gaming Corporation LLC"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  The full legal name of your company, if different from the
                  display name above.
                </p>
              </div>

              <Button
                type="button"
                className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
              >
                Register Company
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Success state */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Success state:
          </p>
          <Card className="border-2 border-accent/50 bg-accent/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: 'monospace' }}
              >
                Company Registered
              </CardTitle>
              <CardDescription>Redirecting to casino setup...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ============================================================
// Section: Bootstrap Casino
// ============================================================

function BootstrapSection() {
  return (
    <OnboardingShell>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Create Your Casino Workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up your casino to start managing players and tables.
          </p>
        </div>

        <Card className="border-2 border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Casino Details
            </CardTitle>
            <CardDescription>
              Enter your casino information to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="review-casino_name"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Casino Name
                </Label>
                <Input
                  id="review-casino_name"
                  placeholder="e.g. Golden Palace Casino"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="review-timezone"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Timezone
                </Label>
                <Select defaultValue="America/Los_Angeles">
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      'America/Los_Angeles',
                      'America/Denver',
                      'America/Chicago',
                      'America/New_York',
                    ].map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace('_', ' ').replace('America/', '')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="review-gaming_day_start"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Gaming Day Start
                </Label>
                <Input
                  id="review-gaming_day_start"
                  type="time"
                  defaultValue="06:00"
                />
              </div>

              <Button
                type="button"
                className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
              >
                Create Casino
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Success + error states */}
        <div className="space-y-4">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Success state:
          </p>
          <Card className="border-2 border-accent/50 bg-accent/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: 'monospace' }}
              >
                Casino Created
              </CardTitle>
              <CardDescription>
                Your workspace is ready. Redirecting...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full h-10 text-xs font-semibold uppercase tracking-wider">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>

          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Error state:
          </p>
          <Card className="border-2 border-border/50">
            <CardContent className="pt-6">
              <div className="rounded-md border-2 border-destructive/50 bg-destructive/5 p-3">
                <p
                  className="text-xs font-bold uppercase tracking-widest text-destructive"
                  style={{ fontFamily: 'monospace' }}
                >
                  You already have an active casino.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ============================================================
// Section: Invite / Manage
// ============================================================

function InviteManageSection() {
  function getInviteStatus(invite: (typeof MOCK_INVITES)[number]) {
    if (invite.accepted_at) {
      return {
        label: 'Accepted',
        className: 'bg-green-500/10 text-green-400 border-green-500/30',
      };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return {
        label: 'Expired',
        className: 'bg-red-500/10 text-red-400 border-red-500/30',
      };
    }
    return {
      label: 'Pending',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    };
  }

  return (
    <OnboardingShell>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Invite Staff
          </h1>
          <p className="text-sm text-muted-foreground">
            Create invite links for your team members.
          </p>
        </div>

        {/* Create Invite */}
        <Card className="border-2 border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Create Invite
            </CardTitle>
            <CardDescription>
              Send an invite link to a new team member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="review-invite-email"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Email
                </Label>
                <Input
                  id="review-invite-email"
                  type="email"
                  placeholder="staff@casino.com"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="review-invite-role"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Role
                </Label>
                <Select defaultValue="dealer">
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dealer">Dealer</SelectItem>
                    <SelectItem value="pit_boss">Pit Boss</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
              >
                Create Invite
              </Button>
            </form>

            {/* Invite link display */}
            <div className="mt-5 rounded-md border-2 border-accent/30 bg-accent/5 p-4 space-y-2">
              <Label
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                Invite Link
              </Label>
              <div className="flex gap-2">
                <Input
                  value="https://app.pitstation.io/invite/accept?token=abc123..."
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold uppercase tracking-wider shrink-0"
                >
                  Copy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite List */}
        <Card className="border-2 border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Sent Invites ({MOCK_INVITES.length})
            </CardTitle>
            <CardDescription>
              Track the status of your invitations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {MOCK_INVITES.map((invite) => {
                const status = getInviteStatus(invite);
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-lg border-2 border-border/30 bg-card/30 p-3 transition-all hover:border-accent/30"
                  >
                    <div className="space-y-1">
                      <p
                        className="text-sm font-medium"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {invite.email}
                      </p>
                      <p
                        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {invite.staff_role.replace('_', ' ')}
                      </p>
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Empty state */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Empty state:
          </p>
          <Card className="border-2 border-dashed border-border/50 bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                No invites yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create one above to get started.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ============================================================
// Section: Invite / Accept
// ============================================================

function InviteAcceptSection() {
  return (
    <OnboardingShell>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Accept Invite States
          </h1>
          <p className="text-sm text-muted-foreground">
            All possible states during the invite acceptance flow.
          </p>
        </div>

        {/* Loading */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Loading:
          </p>
          <Card className="border-2 border-border/50">
            <CardContent className="py-12 text-center">
              <div className="space-y-3">
                <div className="mx-auto h-6 w-6 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
                <p
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Accepting invite...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Success */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Success:
          </p>
          <Card className="border-2 border-accent/50 bg-accent/5">
            <CardContent className="py-12 text-center">
              <div className="space-y-3">
                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mx-auto" />
                <p
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  Welcome! Redirecting to your dashboard...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Already a member */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Already bound:
          </p>
          <Card className="border-2 border-accent/50 bg-accent/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: 'monospace' }}
              >
                Already a Member
              </CardTitle>
              <CardDescription>You already belong to a casino.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full h-10 text-xs font-semibold uppercase tracking-wider">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Expired */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Expired:
          </p>
          <Card className="border-2 border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest text-destructive"
                style={{ fontFamily: 'monospace' }}
              >
                Invite Expired
              </CardTitle>
              <CardDescription>
                This invite has expired. Please ask your admin for a new link.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Invalid */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Invalid:
          </p>
          <Card className="border-2 border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest text-destructive"
                style={{ fontFamily: 'monospace' }}
              >
                Invalid Invite
              </CardTitle>
              <CardDescription>
                This invite link is invalid. Please request a new one from your
                admin.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Missing token */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Missing token:
          </p>
          <div className="text-center space-y-3">
            <h2
              className="text-sm font-bold uppercase tracking-widest text-destructive"
              style={{ fontFamily: 'monospace' }}
            >
              Invalid Invite Link
            </h2>
            <p className="text-sm text-muted-foreground">
              This invite link is missing the token parameter.
            </p>
          </div>
        </div>

        {/* Claims refresh error */}
        <div className="space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center"
            style={{ fontFamily: 'monospace' }}
          >
            Claims refresh error:
          </p>
          <Card className="border-2 border-accent/50 bg-accent/5">
            <CardHeader>
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: 'monospace' }}
              >
                Invite Accepted
              </CardTitle>
              <CardDescription>Finalizing your session...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 rounded-md border-2 border-destructive/50 bg-destructive/5 p-3">
                <p
                  className="text-xs font-bold uppercase tracking-widest text-destructive"
                  style={{ fontFamily: 'monospace' }}
                >
                  Claims verification failed
                </p>
              </div>
              <Button className="w-full h-10 text-xs font-semibold uppercase tracking-wider">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ============================================================
// Section: Setup Wizard
// ============================================================

const WIZARD_STEPS = [
  'Casino Basics',
  'Game Settings',
  'Create Tables',
  'Par Targets',
  'Review & Complete',
] as const;

function SetupWizardSection() {
  const [wizardStep, setWizardStep] = useState(0);

  const noop = () => {};

  return (
    <OnboardingShell>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Setup Your Casino
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure your workspace in a few steps
          </p>
        </div>

        {/* Step Selector */}
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {WIZARD_STEPS.map((label, idx) => (
            <Button
              key={label}
              variant={wizardStep === idx ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs font-semibold uppercase tracking-wider"
              onClick={() => setWizardStep(idx)}
            >
              {idx + 1}. {label}
            </Button>
          ))}
        </div>

        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={wizardStep}
          onStepClick={setWizardStep}
          optionalSteps={[]}
        />

        {/* Step Content */}
        {wizardStep === 0 && (
          <StepCasinoBasics
            settings={MOCK_CASINO_SETTINGS}
            isPending={false}
            onSave={noop}
          />
        )}

        {wizardStep === 1 && <GameSeedPreview />}

        {wizardStep === 2 && (
          <StepCreateTables
            existingTables={MOCK_GAMING_TABLES}
            gameSettings={MOCK_GAME_SETTINGS}
            isPending={false}
            onSave={noop}
            onBack={noop}
          />
        )}

        {wizardStep === 3 && (
          <StepParTargets
            tables={MOCK_GAMING_TABLES}
            gameSettings={MOCK_GAME_SETTINGS}
            bankMode={MOCK_CASINO_SETTINGS.table_bank_mode}
            isPending={false}
            onSave={noop}
            onBack={noop}
            onSkip={noop}
          />
        )}

        {wizardStep === 4 && (
          <StepReviewComplete
            settings={MOCK_CASINO_SETTINGS}
            games={MOCK_GAME_SETTINGS}
            tables={MOCK_GAMING_TABLES}
            isPending={false}
            onComplete={noop}
            onBack={noop}
            onJumpToStep={setWizardStep}
          />
        )}
      </div>
    </OnboardingShell>
  );
}

// ============================================================
// Game Seed step preview (simplified — the real component
// requires template seeding callbacks)
// ============================================================

function GameSeedPreview() {
  const [showForm, setShowForm] = useState(false);

  const GAME_TYPE_LABELS: Record<string, string> = {
    blackjack: 'Blackjack',
    poker: 'Poker',
    baccarat: 'Baccarat',
    pai_gow: 'Pai Gow',
    carnival: 'Carnival',
  };

  const groupedGames = ['blackjack', 'baccarat', 'pai_gow']
    .map((gt) => ({
      gameType: gt,
      label: GAME_TYPE_LABELS[gt] ?? gt,
      items: MOCK_GAME_SETTINGS.filter((g) => g.game_type === gt),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Card className="border-2 border-border/50">
      <CardHeader>
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Game Settings
        </CardTitle>
        <CardDescription>
          Select default games for your casino or add custom ones. You can edit
          any game after adding it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs font-semibold uppercase tracking-wider"
          >
            Your Games
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs font-semibold uppercase tracking-wider"
          >
            Add from Catalog
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs font-semibold uppercase tracking-wider"
            onClick={() => setShowForm((s) => !s)}
          >
            Add Custom Game
          </Button>
          <Badge
            variant="outline"
            className="ml-auto bg-accent/10 text-accent border-accent/30"
          >
            {MOCK_GAME_SETTINGS.length} games configured
          </Badge>
        </div>

        {/* Configured games table */}
        {!showForm &&
          groupedGames.map((group) => (
            <div key={group.gameType}>
              <div className="mb-2 flex items-center gap-2">
                <h4
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  {group.label}
                </h4>
                <Badge
                  variant="outline"
                  className="text-xs bg-accent/10 text-accent border-accent/30"
                >
                  {group.items.length}
                </Badge>
              </div>
              <div className="rounded-md border-2 border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                        Variant
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                        House Edge
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                        Decisions/hr
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                        Seats
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((game) => (
                      <tr
                        key={game.id}
                        className="border-b border-border/30 last:border-b-0"
                      >
                        <td className="px-4 py-2 font-medium">{game.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {game.variant_name ?? '\u2014'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {game.house_edge}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          {game.decisions_per_hour}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {game.seats_available}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

        {/* Custom game form */}
        {showForm && (
          <div className="rounded-md border-2 border-accent/30 bg-accent/5 p-4">
            <h3
              className="mb-3 text-xs font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              New Game Setting
            </h3>
            <GameSettingsForm
              mode="create"
              isPending={false}
              onSubmit={() => setShowForm(false)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            className="h-9 text-xs font-semibold uppercase tracking-wider"
          >
            Back
          </Button>
          <Button className="h-9 text-xs font-semibold uppercase tracking-wider">
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Standalone Component Demos
// ============================================================

function ComponentDemos() {
  const [bankMode, setBankMode] = useState<
    'INVENTORY_COUNT' | 'IMPREST_TO_PAR' | null
  >('IMPREST_TO_PAR');
  const [parValue, setParValue] = useState('10000');
  const [tableRow, setTableRow] = useState<TableFormRow>({
    id: 'demo-1',
    label: 'BJ-01',
    type: 'blackjack',
    pit: 'Main',
    game_settings_id: 'gs-001',
  });

  return (
    <div className="space-y-8">
      <h2
        className="text-xs font-bold uppercase tracking-widest text-center text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        Standalone Components
      </h2>

      <Separator />

      {/* Bank Mode Selector */}
      <div className="space-y-3">
        <h3
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Bank Mode Selector
        </h3>
        <BankModeSelector value={bankMode} onChange={setBankMode} />
      </div>

      <Separator />

      {/* Par Entry Row */}
      <div className="space-y-3">
        <h3
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Par Entry Row
        </h3>
        <ParEntryRow
          tableId="demo-par"
          tableLabel="BJ-01"
          gameType="blackjack"
          variantName="6-deck shoe, S17"
          value={parValue}
          bankMode="IMPREST_TO_PAR"
          onChange={setParValue}
        />
      </div>

      <Separator />

      {/* Table Row Form */}
      <div className="space-y-3">
        <h3
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Table Row Form
        </h3>
        <TableRowForm
          row={tableRow}
          gameSettings={MOCK_GAME_SETTINGS}
          availableGameTypes={['blackjack', 'baccarat', 'pai_gow']}
          onChange={setTableRow}
          onRemove={() => {}}
        />
      </div>

      <Separator />

      {/* Wizard Stepper states */}
      <div className="space-y-3">
        <h3
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Wizard Stepper (step 0, 2, 4)
        </h3>
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={0}
          optionalSteps={[]}
        />
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={2}
          optionalSteps={[]}
        />
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={4}
          optionalSteps={[]}
        />
      </div>
    </div>
  );
}

// ============================================================
// Main Review Page
// ============================================================

export default function OnboardingReviewPage() {
  const [activeSection, setActiveSection] = useState<SectionId>('Setup Wizard');
  const [showComponents, setShowComponents] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Review Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 bg-accent rounded-full" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Onboarding UI Review
                </h1>
                <p className="text-sm text-muted-foreground">
                  PRD-060 Company Registration + Setup Wizard
                </p>
              </div>
            </div>
          </div>

          {/* Section tabs */}
          <div className="mt-4 flex items-center gap-1 flex-wrap">
            {SECTIONS.map((section) => (
              <Button
                key={section}
                variant={activeSection === section ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs font-semibold uppercase tracking-wider"
                onClick={() => setActiveSection(section)}
              >
                {section}
              </Button>
            ))}
            <div className="ml-auto">
              <Button
                variant={showComponents ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs font-semibold uppercase tracking-wider"
                onClick={() => setShowComponents((s) => !s)}
              >
                Components
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Section content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {activeSection === 'Register' && <RegisterSection />}
        {activeSection === 'Bootstrap' && <BootstrapSection />}
        {activeSection === 'Invite / Manage' && <InviteManageSection />}
        {activeSection === 'Invite / Accept' && <InviteAcceptSection />}
        {activeSection === 'Setup Wizard' && <SetupWizardSection />}

        {showComponents && (
          <div className="mt-12">
            <ComponentDemos />
          </div>
        )}
      </main>
    </div>
  );
}

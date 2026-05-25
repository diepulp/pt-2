'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Mail, MapPin, User } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { dateSchema } from '@/lib/validation';
import type {
  PlayerDTO,
  IdentityAddress,
  PlayerIdentityDTO,
} from '@/services/player/dtos';

const playerEditSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  middle_name: z.string().max(100).nullable().optional(),
  last_name: z.string().min(1, 'Last name is required').max(100),
  birth_date: dateSchema('birth_date').nullable().optional(),
  email: z
    .string()
    .email('Invalid email')
    .nullable()
    .optional()
    .or(z.literal('')),
  phone_number: z
    .string()
    .min(7, 'Phone number must be at least 7 characters')
    .max(20)
    .nullable()
    .optional()
    .or(z.literal('')),
  address_street: z.string().max(200).nullable().optional(),
  address_city: z.string().max(100).nullable().optional(),
  address_state: z.string().max(50).nullable().optional(),
  address_postal_code: z.string().max(20).nullable().optional(),
});

export type PlayerEditFormValues = z.infer<typeof playerEditSchema>;

interface PlayerEditFormProps {
  player: PlayerDTO;
  identity?: PlayerIdentityDTO | null;
  onSubmit: (
    values: PlayerEditFormValues,
    dirtyFields: Partial<Record<keyof PlayerEditFormValues, boolean>>,
  ) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <h4
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </h4>
    </div>
  );
}

export function PlayerEditForm({
  player,
  identity,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PlayerEditFormProps) {
  const address = identity?.address as IdentityAddress | null;

  const form = useForm<PlayerEditFormValues>({
    resolver: zodResolver(playerEditSchema),
    defaultValues: {
      first_name: player.first_name,
      middle_name: player.middle_name ?? '',
      last_name: player.last_name,
      birth_date: player.birth_date ?? identity?.birthDate ?? '',
      email: player.email ?? '',
      phone_number: player.phone_number ?? '',
      address_street: address?.street ?? '',
      address_city: address?.city ?? '',
      address_state: address?.state ?? '',
      address_postal_code: address?.postalCode ?? '',
    },
  });

  // Reset form when identity data loads/changes to populate fallback values
  React.useEffect(() => {
    if (identity) {
      const addr = identity.address as IdentityAddress | null;
      form.reset({
        first_name: player.first_name,
        middle_name: player.middle_name ?? '',
        last_name: player.last_name,
        birth_date: player.birth_date ?? identity.birthDate ?? '',
        email: player.email ?? '',
        phone_number: player.phone_number ?? '',
        address_street: addr?.street ?? '',
        address_city: addr?.city ?? '',
        address_state: addr?.state ?? '',
        address_postal_code: addr?.postalCode ?? '',
      });
    }
  }, [identity, player, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values, form.formState.dirtyFields);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Personal Information */}
      <div className="space-y-3">
        <SectionHeader icon={User} label="Personal Information" />
        <div className="grid grid-cols-3 gap-4">
          <FormField
            id="first_name"
            label="First Name"
            required
            error={form.formState.errors.first_name?.message}
          >
            <Input
              id="first_name"
              className="font-mono"
              {...form.register('first_name')}
              aria-invalid={!!form.formState.errors.first_name}
            />
          </FormField>
          <FormField
            id="middle_name"
            label="Middle Name"
            optional
            error={form.formState.errors.middle_name?.message}
          >
            <Input
              id="middle_name"
              className="font-mono"
              {...form.register('middle_name')}
            />
          </FormField>
          <FormField
            id="last_name"
            label="Last Name"
            required
            error={form.formState.errors.last_name?.message}
          >
            <Input
              id="last_name"
              className="font-mono"
              {...form.register('last_name')}
              aria-invalid={!!form.formState.errors.last_name}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            id="birth_date"
            label="Birth Date"
            optional
            error={form.formState.errors.birth_date?.message}
          >
            <Input
              id="birth_date"
              type="date"
              className="font-mono tabular-nums"
              {...form.register('birth_date')}
              aria-invalid={!!form.formState.errors.birth_date}
            />
          </FormField>
        </div>
      </div>

      <Separator />

      {/* Contact Information */}
      <div className="space-y-3">
        <SectionHeader icon={Mail} label="Contact Information" />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            id="email"
            label="Email"
            optional
            error={form.formState.errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              className="font-mono"
              {...form.register('email')}
              aria-invalid={!!form.formState.errors.email}
            />
          </FormField>
          <FormField
            id="phone_number"
            label="Phone Number"
            optional
            error={form.formState.errors.phone_number?.message}
          >
            <Input
              id="phone_number"
              type="tel"
              className="font-mono tabular-nums"
              {...form.register('phone_number')}
              aria-invalid={!!form.formState.errors.phone_number}
            />
          </FormField>
        </div>
      </div>

      <Separator />

      {/* Address */}
      <div className="space-y-3">
        <SectionHeader icon={MapPin} label="Address" />
        <FormField
          id="address_street"
          label="Street"
          optional
          error={form.formState.errors.address_street?.message}
        >
          <Input
            id="address_street"
            className="font-mono"
            {...form.register('address_street')}
          />
        </FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            id="address_city"
            label="City"
            optional
            error={form.formState.errors.address_city?.message}
          >
            <Input
              id="address_city"
              className="font-mono"
              {...form.register('address_city')}
            />
          </FormField>
          <FormField
            id="address_state"
            label="State"
            optional
            error={form.formState.errors.address_state?.message}
          >
            <Input
              id="address_state"
              className="font-mono"
              {...form.register('address_state')}
            />
          </FormField>
          <FormField
            id="address_postal_code"
            label="Postal Code"
            optional
            error={form.formState.errors.address_postal_code?.message}
          >
            <Input
              id="address_postal_code"
              className="font-mono tabular-nums"
              {...form.register('address_postal_code')}
            />
          </FormField>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border/40">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold uppercase tracking-wider"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          disabled={isSubmitting || !form.formState.isDirty}
        >
          {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}

function FormField({
  id,
  label,
  required,
  optional,
  error,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className={cn(
          'text-sm text-muted-foreground',
          required && "after:content-['*'] after:ml-0.5 after:text-destructive",
        )}
      >
        {label}
        {optional && (
          <span className="ml-1 text-xs text-muted-foreground/50">
            optional
          </span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

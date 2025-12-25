"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  PlayerIdentityInput,
  IdentityAddress,
} from "@/services/player/dtos";

import { DocumentNumberInput } from "./document-input";

export interface IdentityFormProps {
  /** Current form values */
  value: PlayerIdentityInput;
  /** Change handler for form updates */
  onChange: (value: PlayerIdentityInput) => void;
  /** Additional class names */
  className?: string;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Validation errors keyed by field name */
  errors?: Partial<Record<keyof PlayerIdentityInput, string>>;
}

/**
 * Identity form for capturing player information from scanned government-issued ID.
 *
 * Field mapping from ID scanner to database (ADR-022):
 * - birth_date -> player_identity.birth_date
 * - gender -> player_identity.gender (m/f/x)
 * - eye_color -> player_identity.eye_color
 * - height -> player_identity.height (format: "6-01")
 * - weight -> player_identity.weight
 * - address -> player_identity.address (JSONB)
 * - documentNumber -> document_number_hash + document_number_last4
 * - issueDate -> player_identity.issue_date
 * - expirationDate -> player_identity.expiration_date
 * - issuingState -> player_identity.issuing_state
 *
 * @see EXEC-SPEC-022 Section 6 (Scanner Field Mapping)
 * @see EXEC-SPEC-022 Section 7 (Address JSONB Structure)
 */
export function IdentityForm({
  value,
  onChange,
  className,
  disabled = false,
  errors = {},
}: IdentityFormProps) {
  // Handle simple field changes
  const handleFieldChange =
    (field: keyof PlayerIdentityInput) => (newValue: string) => {
      onChange({
        ...value,
        [field]: newValue || undefined,
      });
    };

  // Handle address field changes
  const handleAddressChange =
    (field: keyof IdentityAddress) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const currentAddress = value.address || {};
      const newAddress = {
        ...currentAddress,
        [field]: e.target.value || undefined,
      };

      // Remove undefined fields to keep JSONB clean
      const cleanedAddress = Object.fromEntries(
        Object.entries(newAddress).filter(([_, v]) => v !== undefined),
      ) as IdentityAddress;

      onChange({
        ...value,
        address:
          Object.keys(cleanedAddress).length > 0 ? cleanedAddress : undefined,
      });
    };

  return (
    <div className={cn("grid gap-6", className)}>
      {/* Personal Information Section */}
      <div className="grid gap-4">
        <h3 className="text-lg font-medium">Personal Information</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Birth Date */}
          <div className="grid gap-2">
            <Label htmlFor="birth-date">
              Date of Birth
              <span className="ml-1 text-muted-foreground text-xs">
                (from ID)
              </span>
            </Label>
            <Input
              id="birth-date"
              type="date"
              value={value.birthDate || ""}
              onChange={(e) => handleFieldChange("birthDate")(e.target.value)}
              disabled={disabled}
              aria-invalid={!!errors.birthDate}
              aria-describedby={
                errors.birthDate ? "birth-date-error" : undefined
              }
            />
            {errors.birthDate && (
              <p
                id="birth-date-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.birthDate}
              </p>
            )}
          </div>

          {/* Gender */}
          <div className="grid gap-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={value.gender || ""}
              onValueChange={handleFieldChange("gender")}
              disabled={disabled}
            >
              <SelectTrigger
                id="gender"
                aria-invalid={!!errors.gender}
                aria-describedby={errors.gender ? "gender-error" : undefined}
              >
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m">Male</SelectItem>
                <SelectItem value="f">Female</SelectItem>
                <SelectItem value="x">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.gender && (
              <p
                id="gender-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.gender}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Eye Color */}
          <div className="grid gap-2">
            <Label htmlFor="eye-color">Eye Color</Label>
            <Input
              id="eye-color"
              type="text"
              value={value.eyeColor || ""}
              onChange={(e) => handleFieldChange("eyeColor")(e.target.value)}
              placeholder="e.g., Brown"
              disabled={disabled}
              maxLength={50}
              aria-invalid={!!errors.eyeColor}
              aria-describedby={errors.eyeColor ? "eye-color-error" : undefined}
            />
            {errors.eyeColor && (
              <p
                id="eye-color-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.eyeColor}
              </p>
            )}
          </div>

          {/* Height */}
          <div className="grid gap-2">
            <Label htmlFor="height">
              Height
              <span className="ml-1 text-muted-foreground text-xs">
                (e.g., 6-01)
              </span>
            </Label>
            <Input
              id="height"
              type="text"
              value={value.height || ""}
              onChange={(e) => handleFieldChange("height")(e.target.value)}
              placeholder="6-01"
              disabled={disabled}
              pattern="\d{1,2}-\d{2}"
              aria-invalid={!!errors.height}
              aria-describedby={errors.height ? "height-error" : undefined}
            />
            {errors.height && (
              <p
                id="height-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.height}
              </p>
            )}
          </div>

          {/* Weight */}
          <div className="grid gap-2">
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              type="text"
              value={value.weight || ""}
              onChange={(e) => handleFieldChange("weight")(e.target.value)}
              placeholder="e.g., 180"
              disabled={disabled}
              maxLength={10}
              aria-invalid={!!errors.weight}
              aria-describedby={errors.weight ? "weight-error" : undefined}
            />
            {errors.weight && (
              <p
                id="weight-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.weight}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Address Section */}
      <div className="grid gap-4">
        <h3 className="text-lg font-medium">Address</h3>

        <div className="grid gap-4">
          {/* Street */}
          <div className="grid gap-2">
            <Label htmlFor="street">Street</Label>
            <Input
              id="street"
              type="text"
              value={value.address?.street || ""}
              onChange={handleAddressChange("street")}
              placeholder="123 Main St"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* City */}
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                value={value.address?.city || ""}
                onChange={handleAddressChange("city")}
                placeholder="Las Vegas"
                disabled={disabled}
              />
            </div>

            {/* State */}
            <div className="grid gap-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                type="text"
                value={value.address?.state || ""}
                onChange={handleAddressChange("state")}
                placeholder="NV"
                disabled={disabled}
                maxLength={2}
              />
            </div>

            {/* Postal Code */}
            <div className="grid gap-2">
              <Label htmlFor="postal-code">Postal Code</Label>
              <Input
                id="postal-code"
                type="text"
                value={value.address?.postalCode || ""}
                onChange={handleAddressChange("postalCode")}
                placeholder="89101"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Document Information Section */}
      <div className="grid gap-4">
        <h3 className="text-lg font-medium">Document Information</h3>

        {/* Document Number (Secure Input) */}
        <DocumentNumberInput
          value={value.documentNumber || ""}
          onChange={handleFieldChange("documentNumber")}
          disabled={disabled}
          error={errors.documentNumber}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Document Type */}
          <div className="grid gap-2">
            <Label htmlFor="document-type">Document Type</Label>
            <Select
              value={value.documentType || ""}
              onValueChange={handleFieldChange("documentType")}
              disabled={disabled}
            >
              <SelectTrigger
                id="document-type"
                aria-invalid={!!errors.documentType}
                aria-describedby={
                  errors.documentType ? "document-type-error" : undefined
                }
              >
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drivers_license">
                  Driver's License
                </SelectItem>
                <SelectItem value="state_id">State ID</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
              </SelectContent>
            </Select>
            {errors.documentType && (
              <p
                id="document-type-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.documentType}
              </p>
            )}
          </div>

          {/* Issuing State */}
          <div className="grid gap-2">
            <Label htmlFor="issuing-state">Issuing State</Label>
            <Input
              id="issuing-state"
              type="text"
              value={value.issuingState || ""}
              onChange={(e) =>
                handleFieldChange("issuingState")(e.target.value)
              }
              placeholder="e.g., NV"
              disabled={disabled}
              maxLength={50}
              aria-invalid={!!errors.issuingState}
              aria-describedby={
                errors.issuingState ? "issuing-state-error" : undefined
              }
            />
            {errors.issuingState && (
              <p
                id="issuing-state-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.issuingState}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Issue Date */}
          <div className="grid gap-2">
            <Label htmlFor="issue-date">Issue Date</Label>
            <Input
              id="issue-date"
              type="date"
              value={value.issueDate || ""}
              onChange={(e) => handleFieldChange("issueDate")(e.target.value)}
              disabled={disabled}
              aria-invalid={!!errors.issueDate}
              aria-describedby={
                errors.issueDate ? "issue-date-error" : undefined
              }
            />
            {errors.issueDate && (
              <p
                id="issue-date-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.issueDate}
              </p>
            )}
          </div>

          {/* Expiration Date */}
          <div className="grid gap-2">
            <Label htmlFor="expiration-date">Expiration Date</Label>
            <Input
              id="expiration-date"
              type="date"
              value={value.expirationDate || ""}
              onChange={(e) =>
                handleFieldChange("expirationDate")(e.target.value)
              }
              disabled={disabled}
              aria-invalid={!!errors.expirationDate}
              aria-describedby={
                errors.expirationDate ? "expiration-date-error" : undefined
              }
            />
            {errors.expirationDate && (
              <p
                id="expiration-date-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.expirationDate}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface RatingSlipModalSkeletonProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Animated skeleton with staggered delay for cascading effect
 */
function AnimatedSkeleton({
  className,
  delay = 0,
  ...props
}: React.ComponentProps<"div"> & { delay?: number }) {
  return (
    <Skeleton
      className={cn(className)}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    />
  );
}

/**
 * Skeleton for increment/decrement input row: [-] [input] [+]
 */
function InputControlRowSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-center space-x-2 mt-1">
      <AnimatedSkeleton className="h-10 w-10 rounded-md" delay={delay} />
      <AnimatedSkeleton className="h-12 flex-1 rounded-md" delay={delay + 25} />
      <AnimatedSkeleton className="h-10 w-10 rounded-md" delay={delay + 50} />
    </div>
  );
}

/**
 * Skeleton for 5-column increment button group
 */
function IncrementButtonsSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="grid grid-cols-5 gap-2 mt-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <AnimatedSkeleton
          key={i}
          className="h-8 rounded-md"
          delay={delay + i * 15}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for label + reset button header row
 */
function SectionHeaderSkeleton({
  delay = 0,
  showReset = true,
}: {
  delay?: number;
  showReset?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <AnimatedSkeleton className="h-4 w-24 rounded" delay={delay} />
      {showReset && (
        <AnimatedSkeleton className="h-8 w-14 rounded-md" delay={delay + 10} />
      )}
    </div>
  );
}

/**
 * Skeleton for "Total Change" helper text
 */
function TotalChangeSkeleton({ delay = 0 }: { delay?: number }) {
  return <AnimatedSkeleton className="h-4 w-32 mt-1 rounded" delay={delay} />;
}

/**
 * Rating Slip Modal Skeleton
 *
 * Accurately mirrors the structure of the rating slip modal content
 * with staggered animations for a polished loading experience.
 *
 * @see RatingSlipModal for the actual modal component
 */
export function RatingSlipModalSkeleton({
  isOpen,
  onClose,
}: RatingSlipModalSkeletonProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <AnimatedSkeleton className="h-6 w-36 rounded" delay={0} />
            <AnimatedSkeleton className="h-5 w-24 rounded" delay={25} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* FormSectionAverageBet Skeleton */}
          <div>
            <SectionHeaderSkeleton delay={50} />
            <InputControlRowSkeleton delay={75} />
            <IncrementButtonsSkeleton delay={125} />
            <TotalChangeSkeleton delay={200} />
          </div>

          {/* FormSectionCashIn Skeleton */}
          <div>
            {/* Total Cash In display box */}
            <div className="mb-3 p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <AnimatedSkeleton className="h-4 w-24 rounded" delay={225} />
                <AnimatedSkeleton className="h-5 w-20 rounded" delay={240} />
              </div>
            </div>
            {/* New Buy-In section */}
            <SectionHeaderSkeleton delay={260} />
            <InputControlRowSkeleton delay={285} />
            <IncrementButtonsSkeleton delay={335} />
            <TotalChangeSkeleton delay={410} />
          </div>

          {/* FormSectionStartTime Skeleton */}
          <div>
            <SectionHeaderSkeleton delay={435} />
            <div className="flex items-center space-x-2 mt-1">
              {/* -15m button */}
              <AnimatedSkeleton className="h-10 w-14 rounded-md" delay={460} />
              {/* datetime input */}
              <AnimatedSkeleton
                className="h-12 flex-1 rounded-md"
                delay={480}
              />
              {/* +15m button */}
              <AnimatedSkeleton className="h-10 w-14 rounded-md" delay={500} />
            </div>
            <TotalChangeSkeleton delay={520} />
          </div>

          {/* FormSectionMovePlayer Skeleton */}
          <div>
            <div className="flex justify-between items-center">
              <AnimatedSkeleton className="h-4 w-24 rounded" delay={545} />
              <AnimatedSkeleton className="h-3 w-32 rounded" delay={560} />
            </div>
            {/* 2-column grid: table select + seat input */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <AnimatedSkeleton className="h-10 rounded-md" delay={580} />
              <AnimatedSkeleton className="h-10 rounded-md" delay={595} />
            </div>
            {/* Move Player button */}
            <AnimatedSkeleton
              className="h-10 w-full mt-2 rounded-md"
              delay={615}
            />
          </div>

          {/* FormSectionChipsTaken Skeleton */}
          <div>
            <SectionHeaderSkeleton delay={640} showReset={false} />
            <InputControlRowSkeleton delay={660} />
            <IncrementButtonsSkeleton delay={710} />
          </div>

          {/* Financial Summary Card Skeleton */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <AnimatedSkeleton className="h-4 w-36 mb-3 rounded" delay={785} />
            <div className="space-y-2">
              {/* Cash In row */}
              <div className="flex justify-between">
                <AnimatedSkeleton className="h-4 w-16 rounded" delay={805} />
                <AnimatedSkeleton className="h-4 w-20 rounded" delay={815} />
              </div>
              {/* Chips Out row */}
              <div className="flex justify-between">
                <AnimatedSkeleton className="h-4 w-20 rounded" delay={835} />
                <AnimatedSkeleton className="h-4 w-20 rounded" delay={845} />
              </div>
              {/* Net Position row */}
              <div className="flex justify-between pt-2 border-t">
                <AnimatedSkeleton className="h-4 w-24 rounded" delay={865} />
                <AnimatedSkeleton className="h-4 w-20 rounded" delay={875} />
              </div>
            </div>
          </div>

          {/* Loyalty Points Card Skeleton */}
          <div className="p-4 bg-card border border-border rounded-lg">
            {/* Current balance row */}
            <div className="flex justify-between items-center">
              <AnimatedSkeleton className="h-4 w-36 rounded" delay={900} />
              <AnimatedSkeleton className="h-6 w-24 rounded" delay={915} />
            </div>
            {/* Session reward estimate section */}
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <AnimatedSkeleton className="h-4 w-40 rounded" delay={935} />
                <AnimatedSkeleton className="h-5 w-20 rounded" delay={950} />
              </div>
              <AnimatedSkeleton className="h-3 w-48 mt-1 rounded" delay={970} />
            </div>
            {/* Tier display */}
            <AnimatedSkeleton className="h-3 w-20 mt-2 rounded" delay={990} />
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex gap-2 flex-shrink-0 pt-4 border-t border-border">
          <AnimatedSkeleton className="h-10 flex-1 rounded-md" delay={1010} />
          <AnimatedSkeleton className="h-10 flex-1 rounded-md" delay={1030} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

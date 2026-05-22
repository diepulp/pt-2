'use client';

/**
 * Report Action Toolbar
 *
 * Sits OUTSIDE the document. Three actions:
 * - Export CSV (client-side, financial summary only)
 * - Generate PDF (future: POST to /api/v1/reports/shift-summary/pdf)
 * - Send Report (future: dialog → POST to /api/v1/reports/shift-summary/send)
 *
 * PDF and Send are stub buttons for WS3/WS4.
 *
 * @see EXEC-065 WS2
 */

import { Download, FileText, Send } from 'lucide-react';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { ShiftReportDTO } from '@/services/reporting/shift-report';

import { downloadCSV } from './csv-export';

interface ReportActionToolbarProps {
  report: ShiftReportDTO;
}

export function ReportActionToolbar({ report }: ReportActionToolbarProps) {
  const [isPdfPending, startPdfTransition] = useTransition();
  const [isSendPending, startSendTransition] = useTransition();

  const handleExportCSV = () => {
    if (!report.financialSummary) return;
    downloadCSV(
      report.financialSummary,
      report.executiveSummary.gamingDay,
      report.executiveSummary.shiftBoundary,
    );
  };

  const handleGeneratePDF = () => {
    startPdfTransition(() => {
      // WS3: POST /api/v1/reports/shift-summary/pdf
      // Opens PDF in new tab or triggers download
      const params = new URLSearchParams({
        gaming_day: report.executiveSummary.gamingDay,
        shift_boundary: report.executiveSummary.shiftBoundary,
      });
      window.open(
        `/api/v1/reports/shift-summary/pdf?${params.toString()}`,
        '_blank',
      );
    });
  };

  const handleSendReport = () => {
    startSendTransition(() => {
      // WS4: Opens dialog with recipient email inputs
      // For now, this is a placeholder
      // Future: dialog component with form → POST /api/v1/reports/shift-summary/send
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 print:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCSV}
        disabled={!report.financialSummary}
        className="text-xs font-semibold uppercase tracking-wider"
      >
        <Download className="size-3.5" />
        Export CSV
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleGeneratePDF}
        disabled={isPdfPending}
        className="text-xs font-semibold uppercase tracking-wider"
      >
        <FileText className="size-3.5" />
        {isPdfPending ? 'Generating...' : 'Generate PDF'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleSendReport}
        disabled={isSendPending}
        className="text-xs font-semibold uppercase tracking-wider"
      >
        <Send className="size-3.5" />
        {isSendPending ? 'Sending...' : 'Send Report'}
      </Button>
    </div>
  );
}

/**
 * PDF Section: Report Footer
 *
 * Fixed-position footer with reference ID, page numbering, and disclaimer.
 * Rendered on every page via the Page fixed prop.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { ReportFooterSection } from '../../dtos';
import { styles } from '../styles';

interface ReportFooterPdfProps {
  footer: ReportFooterSection;
}

export function ReportFooterPdf({ footer }: ReportFooterPdfProps) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        {footer.referenceId} | {footer.casinoName} | {footer.gamingDay}
      </Text>
      <Text style={styles.footerText}>CONFIDENTIAL - Internal Use Only</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

import { useCallback, useState } from 'react';
import { getConfiguredReportPaper, pickRollPaper, type PrintReportOptions, type ReportPaper } from '../utils/printReport';
import { printWithNotice } from '../utils/reportNotice';

export interface UsePrintReportConfig extends Omit<PrintReportOptions, 'paper'> {
  /** Arabic report title: used in the saved file name and in the messages */
  reportName: string;
  /** false when the report has no rows: the user gets "no data" instead of an empty printout */
  hasData?: boolean;
  /** 'roll' = the cashier-printer roll width from the saved report paper setting (A4 falls back to 80mm) */
  paper?: ReportPaper | 'roll';
}

/**
 * One handler for every report print button: prints through the host, or saves the same report as PDF/HTML when there is
 * no printer or printing fails, and always tells the user what happened. `printing` drives the button loading state.
 */
export function usePrintReport(config: UsePrintReportConfig): { print: () => Promise<void>; printing: boolean } {
  const { reportName, hasData, kind, orientation, paper } = config;
  const [printing, setPrinting] = useState(false);

  const print = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const resolvedPaper: ReportPaper | undefined =
        paper === 'roll' ? pickRollPaper(await getConfiguredReportPaper()) : paper;
      await printWithNotice({ kind, orientation, paper: resolvedPaper }, { reportName, hasData });
    } finally {
      setPrinting(false);
    }
  }, [printing, reportName, hasData, kind, orientation, paper]);

  return { print, printing };
}

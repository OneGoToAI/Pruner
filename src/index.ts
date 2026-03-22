/**
 * Pruner - Token Compression Proxy Session Reporting
 *
 * Main exports for the session reporting functionality
 */

// Types
export * from './types';

// Session statistics and reporting
export {
  SessionReporter,
  initializeSession,
  getCurrentSession,
  recordRequest,
  finalizeSession,
  resetSession
} from './stats/report';

// Banner and UI functionality
export {
  printStartupBanner,
  printFinalReport,
  printSimpleReport,
  setupExitHandlers
} from './ui/banner';
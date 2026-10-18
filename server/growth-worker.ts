import { maintainFiscal } from './integrations.js';
import { runWhatsApp } from './whatsapp.js';
import { adminClient } from './security.js';
import { campaignReady, runCustomerCampaigns } from './business-campaigns.js';
import { maintainDepositHolds, maintainClubPayments, runClubRenewals } from './growth-payments.js';
export async function runGrowthWorker(
  deps: {
    db?: any;
    campaigns?: () => Promise<any>;
    clubs?: () => Promise<any>;
    holds?: () => Promise<any>;
    fiscal?: () => Promise<any>;
    whatsapp?: () => Promise<any>;
    clubPayments?: () => Promise<any>;
    /** True only when invoked by the automated database scheduler. */
    scheduled?: boolean;
    now?: () => number;
  } = {},
) {
  const db = deps.db || adminClient();
  // Keep payment holds, reconciliation, campaigns and WhatsApp timely.
  // Financial subscription generation only needs hourly checks, while
  // draft fiscal reconciliation is checked every 20 minutes.
  // Explicit/manual runs retain the full set of tasks for compatibility.
  const minute = new Date(deps.now?.() ?? Date.now()).getUTCMinutes();
  const runClubs = !deps.scheduled || minute === 0;
  const runFiscal = !deps.scheduled || minute % 20 === 0;
  const results = await Promise.allSettled([
    (async () => {
      if (campaignReady()) {
        const { error } = await db.rpc('prepare_retention_campaigns', { p_limit: 10 });
        if (error) throw error;
      }
      return deps.campaigns ? deps.campaigns() : runCustomerCampaigns();
    })(),
    runClubs ? (deps.clubs ? deps.clubs() : runClubRenewals()) : Promise.resolve({ skipped: 'cadence' }),
    deps.holds ? deps.holds() : maintainDepositHolds(),
    deps.clubPayments ? deps.clubPayments() : maintainClubPayments(),
    deps.whatsapp ? deps.whatsapp() : runWhatsApp(db),
    runFiscal ? (deps.fiscal ? deps.fiscal() : maintainFiscal(db)) : Promise.resolve({ skipped: 'cadence' }),
  ]);
  const names = ['campaigns', 'clubs', 'holds', 'clubPayments', 'whatsapp', 'fiscal'];
  return {
    ok: results.every((r) => r.status === 'fulfilled'),
    ...Object.fromEntries(
      results.map((r, i) => [
        names[i],
        r.status === 'fulfilled'
          ? r.value
          : { error: 'Rotina indisponível; conferir antes de repetir.' },
      ]),
    ),
  };
}

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
  } = {},
) {
  const db = deps.db || adminClient();
  const results = await Promise.allSettled([
    (async () => {
      if (campaignReady()) {
        const { error } = await db.rpc('prepare_retention_campaigns', { p_limit: 10 });
        if (error) throw error;
      }
      return deps.campaigns ? deps.campaigns() : runCustomerCampaigns();
    })(),
    deps.clubs ? deps.clubs() : runClubRenewals(),
    deps.holds ? deps.holds() : maintainDepositHolds(),
    deps.clubPayments ? deps.clubPayments() : maintainClubPayments(),
    deps.whatsapp ? deps.whatsapp() : runWhatsApp(db),
    deps.fiscal ? deps.fiscal() : maintainFiscal(db),
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

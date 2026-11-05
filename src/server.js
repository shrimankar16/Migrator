import { app } from './app.js';
import { cfg } from './config.js';
import { startJob, state, log } from './migrate.js';
app.listen(cfg.PORT, () => log.info(`listening on ${cfg.PORT}`));
if (cfg.SYNC_INTERVAL_MIN > 0) setInterval(() => {
  if (state.status !== 'running') startJob({ kind: 'incremental' }).catch(e => log.error({ err: e.message }, 'sync not started'));
}, cfg.SYNC_INTERVAL_MIN * 60000);

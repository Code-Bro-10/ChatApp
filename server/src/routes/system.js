import { Router } from 'express';
import { getClusterStats } from '../cluster.js';

const router = Router();

// Standard lightweight health check
router.get('/health', async (_req, res) => {
  try {
    const stats = await getClusterStats();
    res.json({
      status: 'ok',
      instance: stats.currentInstance,
      distributed: stats.distributed,
      activeInstances: stats.cluster.totalInstances,
      activeSockets: stats.cluster.totalSockets
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Detailed real cluster metrics for System Monitor UI
router.get('/stats', async (_req, res) => {
  try {
    const stats = await getClusterStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch system stats.' });
  }
});

export default router;

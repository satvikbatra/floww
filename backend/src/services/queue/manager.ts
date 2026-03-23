/**
 * Worker/Queue System - Background job processing
 * 
 * Uses BullMQ for reliable background processing of crawl tasks
 */

import { Queue, Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import IORedis from 'ioredis';

// Lazy Redis connection - only created when queue/workers are used
function createConnection() {
  return env.REDIS_URL
    ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({ maxRetriesPerRequest: null });
}

// Job types
export interface CrawlPageJob {
  url: string;
  projectId: string;
  crawlSessionId: string;
  depth: number;
}

export interface BuildGraphJob {
  projectId: string;
  crawlSessionId: string;
}

export interface GenerateDocsJob {
  projectId: string;
  crawlSessionId: string;
  format: 'markdown' | 'html' | 'pdf';
}

/**
 * Queue Manager - Manages all background queues
 */
export class QueueManager {
  private crawlQueue: Queue<CrawlPageJob>;
  private graphQueue: Queue<BuildGraphJob>;
  private docsQueue: Queue<GenerateDocsJob>;
  private connection: any;

  constructor() {
    this.connection = createConnection();
    this.crawlQueue = new Queue<CrawlPageJob>('crawl', { connection: this.connection });
    this.graphQueue = new Queue<BuildGraphJob>('graph', { connection: this.connection });
    this.docsQueue = new Queue<GenerateDocsJob>('docs', { connection: this.connection });
  }

  /**
   * Add crawl page job
   */
  async addCrawlJob(data: CrawlPageJob): Promise<Job<CrawlPageJob>> {
    return await this.crawlQueue.add('crawl-page', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  /**
   * Add graph building job
   */
  async addGraphJob(data: BuildGraphJob): Promise<Job<BuildGraphJob>> {
    return await this.graphQueue.add('build-graph', data, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
    });
  }

  /**
   * Add documentation generation job
   */
  async addDocsJob(data: GenerateDocsJob): Promise<Job<GenerateDocsJob>> {
    return await this.docsQueue.add('generate-docs', data, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 3000,
      },
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [crawlCounts, graphCounts, docsCounts] = await Promise.all([
      this.crawlQueue.getJobCounts(),
      this.graphQueue.getJobCounts(),
      this.docsQueue.getJobCounts(),
    ]);

    return {
      crawl: crawlCounts,
      graph: graphCounts,
      docs: docsCounts,
    };
  }

  /**
   * Clear all queues
   */
  async clearAll() {
    await Promise.all([
      this.crawlQueue.obliterate({ force: true }),
      this.graphQueue.obliterate({ force: true }),
      this.docsQueue.obliterate({ force: true }),
    ]);
  }

  /**
   * Close all connections
   */
  async close() {
    await Promise.all([
      this.crawlQueue.close(),
      this.graphQueue.close(),
      this.docsQueue.close(),
    ]);
    await this.connection.quit();
  }
}

/**
 * Worker Manager - Manages background workers
 */
export class WorkerManager {
  private crawlWorker: Worker<CrawlPageJob>;
  private graphWorker: Worker<BuildGraphJob>;
  private docsWorker: Worker<GenerateDocsJob>;
  private connection: any;

  constructor() {
    this.connection = createConnection();

    // Crawl worker
    this.crawlWorker = new Worker<CrawlPageJob>(
      'crawl',
      async (job: Job<CrawlPageJob>) => {
        console.log(`Processing crawl job ${job.id}:`, job.data.url);

        // Import services lazily to avoid circular dependencies
        const { db } = await import('../../db/client');

        // Get project
        const project = await db.project.findUnique({
          where: { id: job.data.projectId },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Crawl page (simplified - in real implementation would integrate fully)
        await job.updateProgress(50);

        // Mark as complete
        await job.updateProgress(100);

        return { success: true, url: job.data.url };
      },
      {
        connection: this.connection,
        concurrency: 3,
        limiter: {
          max: 10,
          duration: 1000,
        },
      }
    );

    // Graph worker
    this.graphWorker = new Worker<BuildGraphJob>(
      'graph',
      async (job: Job<BuildGraphJob>) => {
        console.log(`Processing graph job ${job.id} for project:`, job.data.projectId);

        await job.updateProgress(50);
        await job.updateProgress(100);

        return { success: true };
      },
      {
        connection: this.connection,
        concurrency: 2,
      }
    );

    // Docs worker
    this.docsWorker = new Worker<GenerateDocsJob>(
      'docs',
      async (job: Job<GenerateDocsJob>) => {
        console.log(`Processing docs job ${job.id} for project:`, job.data.projectId);

        await job.updateProgress(50);
        await job.updateProgress(100);

        return { success: true };
      },
      {
        connection: this.connection,
        concurrency: 1,
      }
    );

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners() {
    // Crawl worker events
    this.crawlWorker.on('completed', (job) => {
      console.log(`✅ Crawl job ${job.id} completed`);
    });

    this.crawlWorker.on('failed', (job, err) => {
      console.error(`❌ Crawl job ${job?.id} failed:`, err.message);
    });

    // Graph worker events
    this.graphWorker.on('completed', (job) => {
      console.log(`✅ Graph job ${job.id} completed`);
    });

    this.graphWorker.on('failed', (job, err) => {
      console.error(`❌ Graph job ${job?.id} failed:`, err.message);
    });

    // Docs worker events
    this.docsWorker.on('completed', (job) => {
      console.log(`✅ Docs job ${job.id} completed`);
    });

    this.docsWorker.on('failed', (job, err) => {
      console.error(`❌ Docs job ${job?.id} failed:`, err.message);
    });
  }

  /**
   * Close all workers
   */
  async close() {
    await Promise.all([
      this.crawlWorker.close(),
      this.graphWorker.close(),
      this.docsWorker.close(),
    ]);
    await this.connection.quit();
  }
}

// Singleton instances
let queueManager: QueueManager | null = null;
let workerManager: WorkerManager | null = null;

export function getQueueManager(): QueueManager {
  if (!queueManager) {
    queueManager = new QueueManager();
  }
  return queueManager;
}

export function getWorkerManager(): WorkerManager {
  if (!workerManager) {
    workerManager = new WorkerManager();
  }
  return workerManager;
}

/**
 * Initialize workers (call this on server start)
 */
export async function initializeWorkers() {
  if (env.REDIS_URL) {
    console.log('🔧 Initializing background workers...');
    getWorkerManager();
    console.log('✅ Workers initialized');
  } else {
    console.log('⚠️  REDIS_URL not configured, background workers disabled');
  }
}

/**
 * Shutdown workers gracefully
 */
export async function shutdownWorkers() {
  if (workerManager) {
    console.log('🛑 Shutting down workers...');
    await workerManager.close();
    workerManager = null;
  }
  if (queueManager) {
    await queueManager.close();
    queueManager = null;
  }
}

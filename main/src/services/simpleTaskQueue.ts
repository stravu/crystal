import { EventEmitter } from 'events';

interface Job<T> {
  id: string;
  data: T;
  status: 'pending' | 'active' | 'completed' | 'failed';
  result?: any;
  error?: any;
}

export class SimpleQueue<T> extends EventEmitter {
  private jobs: Map<string, Job<T>> = new Map();
  private queue: string[] = [];
  private processing = false;
  private concurrency: number;
  private processor?: (job: Job<T>) => Promise<any>;
  private jobIdCounter = 0;

  constructor(name: string, concurrency = 1) {
    super();
    this.concurrency = concurrency;
    console.log(`[SimpleQueue] Created queue: ${name} with concurrency: ${concurrency}`);
  }

  process(concurrency: number, processor: (job: Job<T>) => Promise<any>) {
    this.concurrency = concurrency;
    this.processor = processor;
    console.log(`[SimpleQueue] Processor registered`);
    this.startProcessing();
  }

  async add(data: T): Promise<Job<T>> {
    const job: Job<T> = {
      id: String(++this.jobIdCounter),
      data,
      status: 'pending'
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    
    console.log(`[SimpleQueue] Job ${job.id} added to queue`);
    this.emit('waiting', job);
    
    // Start processing if not already running
    this.startProcessing();
    
    return job;
  }

  private async startProcessing() {
    if (this.processing || !this.processor) {
      return;
    }

    this.processing = true;
    
    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) continue;
      
      const job = this.jobs.get(jobId);
      if (!job) continue;
      
      job.status = 'active';
      console.log(`[SimpleQueue] Processing job ${job.id}`);
      this.emit('active', job);
      
      try {
        const result = await this.processor(job);
        job.status = 'completed';
        job.result = result;
        console.log(`[SimpleQueue] Job ${job.id} completed`);
        this.emit('completed', job, result);
      } catch (error) {
        job.status = 'failed';
        job.error = error;
        console.error(`[SimpleQueue] Job ${job.id} failed:`, error);
        this.emit('failed', job, error);
      }
      
      // Clean up completed job after a delay
      setTimeout(() => {
        this.jobs.delete(jobId);
      }, 5000);
    }
    
    this.processing = false;
  }

  on(event: 'active' | 'completed' | 'failed' | 'waiting' | 'error', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  async close() {
    // Clean up
    this.queue = [];
    this.jobs.clear();
  }
}
import type { ProjectDashboardData } from '../types/projectDashboard';

interface CacheEntry {
  data: ProjectDashboardData;
  timestamp: number;
}

class DashboardCache {
  private cache: Map<number, CacheEntry> = new Map();
  private readonly CACHE_DURATION = 60 * 1000; // 1 minute cache

  set(projectId: number, data: ProjectDashboardData): void {
    this.cache.set(projectId, {
      data,
      timestamp: Date.now()
    });
  }

  get(projectId: number): ProjectDashboardData | null {
    const entry = this.cache.get(projectId);
    
    if (!entry) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cache.delete(projectId);
      return null;
    }
    
    return entry.data;
  }

  invalidate(projectId: number): void {
    this.cache.delete(projectId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

export const dashboardCache = new DashboardCache();
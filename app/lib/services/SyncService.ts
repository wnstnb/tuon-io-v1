import { localStorageService, type ContentSnapshot } from './LocalStorageService';
import { ArtifactService } from './ArtifactService';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: number;
  error?: Error;
}

class SyncService {
  private syncIntervalId: NodeJS.Timeout | null = null;
  private SYNC_INTERVAL = 30000; // 30 seconds
  private isSyncing = false;
  private syncStates: Map<string, SyncState> = new Map();
  private statusListeners: Map<string, Set<(status: SyncStatus) => void>> = new Map();

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.startSync();
        this.updateAllStatuses('pending');
      });

      window.addEventListener('offline', () => {
        this.stopSync();
        this.updateAllStatuses('offline');
      });
    }
  }

  private updateAllStatuses(status: SyncStatus) {
    Array.from(this.syncStates.keys()).forEach(artifactId => {
      this.updateSyncStatus(artifactId, status);
    });
  }

  private updateSyncStatus(artifactId: string, status: SyncStatus, error?: Error) {
    const newState: SyncState = {
      status,
      lastSyncTime: Date.now(),
      error
    };
    this.syncStates.set(artifactId, newState);

    // Notify listeners
    const listeners = this.statusListeners.get(artifactId);
    if (listeners) {
      listeners.forEach(listener => listener(status));
    }
  }

  subscribeToStatus(artifactId: string, listener: (status: SyncStatus) => void) {
    if (!this.statusListeners.has(artifactId)) {
      this.statusListeners.set(artifactId, new Set());
    }
    this.statusListeners.get(artifactId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.statusListeners.get(artifactId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.statusListeners.delete(artifactId);
        }
      }
    };
  }

  startSync() {
    if (this.syncIntervalId) return;

    // Perform initial sync
    this.syncAll();

    // Set up interval for regular syncing
    this.syncIntervalId = setInterval(() => {
      this.syncAll();
    }, this.SYNC_INTERVAL);
  }

  stopSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  private async syncAll() {
    if (this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    try {
      // Get all artifact IDs with pending changes
      const keys = Object.keys(localStorage);
      const snapshotKeys = keys.filter(key => key.startsWith('tuon_snapshot_'));
      const artifactIds = snapshotKeys.map(key => key.replace('tuon_snapshot_', ''));

      // Sync each artifact
      await Promise.all(artifactIds.map(artifactId => this.syncArtifact(artifactId)));
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncArtifact(artifactId: string) {
    const pendingSnapshots = localStorageService.getPendingSnapshots(artifactId);
    if (pendingSnapshots.length === 0) {
      // If no pending snapshots, check if artifact exists on server just to update status
      const currentStatus = this.getSyncStatus(artifactId);
      if (currentStatus !== 'synced' && currentStatus !== 'offline') {
        try {
          const exists = await ArtifactService.getArtifact(artifactId);
          this.updateSyncStatus(artifactId, exists ? 'synced' : 'pending');
        } catch { 
          this.updateSyncStatus(artifactId, 'error'); 
        }
      }
      return;
    }

    this.updateSyncStatus(artifactId, 'syncing');

    try {
      // Get the latest snapshot to sync
      const latestSnapshot = pendingSnapshots[0];

      // Check if the artifact exists on the server
      console.log(`[SyncService] Checking existence of artifact ${artifactId} on server...`);
      const existingArtifact = await ArtifactService.getArtifact(artifactId);

      let success: boolean;
      if (!existingArtifact) {
        // If artifact doesn't exist, CREATE it using the client-generated ID
        console.log(`[SyncService] Artifact ${artifactId} not found on server. Creating...`);
        success = await ArtifactService.createArtifactWithId(
          artifactId, // Use the client-generated ID
          latestSnapshot.userId,
          latestSnapshot.title,
          latestSnapshot.content
        );
        if (!success) {
          console.error(`[SyncService] Failed to create artifact ${artifactId} on server.`);
        }
      } else {
        // If artifact exists, UPDATE it
        console.log(`[SyncService] Artifact ${artifactId} found on server. Updating...`);
        success = await ArtifactService.updateArtifactContent(
          artifactId,
          latestSnapshot.content,
          latestSnapshot.userId,
          latestSnapshot.title // Pass the title here
        );
        if (!success) {
          console.error(`[SyncService] Failed to update artifact ${artifactId} on server.`);
        }
      }

      if (success) {
        // Mark all snapshots up to this version as synced
        localStorageService.markSnapshotsSynced(artifactId, latestSnapshot.version);
        this.updateSyncStatus(artifactId, 'synced');
        console.log(`[SyncService] Successfully synced artifact ${artifactId}.`);
      } else {
        throw new Error(`Failed to sync artifact ${artifactId} (create or update)`);
      }
    } catch (error) {
      console.error(`[SyncService] Error syncing artifact ${artifactId}:`, error);
      this.updateSyncStatus(artifactId, 'error', error as Error);
    }
  }

  getSyncStatus(artifactId: string): SyncStatus {
    return this.syncStates.get(artifactId)?.status || 'pending';
  }

  async forceSyncArtifact(artifactId: string) {
    console.log(`[SyncService] Force syncing artifact ${artifactId}...`);
    await this.syncArtifact(artifactId);
  }
}

// Export a singleton instance
export const syncService = new SyncService();
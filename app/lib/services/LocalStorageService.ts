import { Block } from '@blocknote/core';

export interface ContentSnapshot {
  id: string;
  artifactId: string;
  title: string;
  content: Block[];
  version: number;
  timestamp: number;
  pendingSync: boolean;
  userId: string;
}

class LocalStorageService {
  private readonly SNAPSHOT_PREFIX = 'tuon_snapshot_';
  private readonly VERSION_PREFIX = 'tuon_version_';
  private readonly MAX_SNAPSHOTS = 50; // Maximum number of snapshots to keep

  constructor() {
    this.cleanupOldSnapshots();
  }

  private getSnapshotKey(artifactId: string): string {
    return `${this.SNAPSHOT_PREFIX}${artifactId}`;
  }

  private getVersionKey(artifactId: string): string {
    return `${this.VERSION_PREFIX}${artifactId}`;
  }

  private getCurrentVersion(artifactId: string): number {
    const version = localStorage.getItem(this.getVersionKey(artifactId));
    return version ? parseInt(version, 10) : 0;
  }

  private incrementVersion(artifactId: string): number {
    const currentVersion = this.getCurrentVersion(artifactId);
    const newVersion = currentVersion + 1;
    localStorage.setItem(this.getVersionKey(artifactId), newVersion.toString());
    return newVersion;
  }

  private cleanupOldSnapshots() {
    try {
      const keys = Object.keys(localStorage);
      const snapshotKeys = keys.filter(key => key.startsWith(this.SNAPSHOT_PREFIX));

      snapshotKeys.forEach(key => {
        const snapshots: ContentSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (snapshots.length > this.MAX_SNAPSHOTS) {
          // Keep only the most recent snapshots
          const sortedSnapshots = snapshots
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, this.MAX_SNAPSHOTS);
          localStorage.setItem(key, JSON.stringify(sortedSnapshots));
        }
      });
    } catch (error) {
      console.error('Error cleaning up old snapshots:', error);
    }
  }

  saveSnapshot(snapshot: Omit<ContentSnapshot, 'version' | 'timestamp'>): ContentSnapshot {
    try {
      const key = this.getSnapshotKey(snapshot.artifactId);
      const existingSnapshots: ContentSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
      
      const newVersion = this.incrementVersion(snapshot.artifactId);
      const newSnapshot: ContentSnapshot = {
        ...snapshot,
        version: newVersion,
        timestamp: Date.now()
      };

      // Add new snapshot to the beginning of the array
      existingSnapshots.unshift(newSnapshot);

      // Keep only the last MAX_SNAPSHOTS
      const trimmedSnapshots = existingSnapshots.slice(0, this.MAX_SNAPSHOTS);
      
      localStorage.setItem(key, JSON.stringify(trimmedSnapshots));
      return newSnapshot;
    } catch (error) {
      console.error('Error saving snapshot:', error);
      throw error;
    }
  }

  getLatestSnapshot(artifactId: string): ContentSnapshot | null {
    try {
      const key = this.getSnapshotKey(artifactId);
      const snapshots: ContentSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
      return snapshots[0] || null;
    } catch (error) {
      console.error('Error getting latest snapshot:', error);
      return null;
    }
  }

  getPendingSnapshots(artifactId: string): ContentSnapshot[] {
    try {
      const key = this.getSnapshotKey(artifactId);
      const snapshots: ContentSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
      return snapshots.filter(snapshot => snapshot.pendingSync);
    } catch (error) {
      console.error('Error getting pending snapshots:', error);
      return [];
    }
  }

  markSnapshotsSynced(artifactId: string, upToVersion: number) {
    try {
      const key = this.getSnapshotKey(artifactId);
      const snapshots: ContentSnapshot[] = JSON.parse(localStorage.getItem(key) || '[]');
      
      const updatedSnapshots = snapshots.map(snapshot => ({
        ...snapshot,
        pendingSync: snapshot.version > upToVersion
      }));

      localStorage.setItem(key, JSON.stringify(updatedSnapshots));
    } catch (error) {
      console.error('Error marking snapshots as synced:', error);
    }
  }

  clearSnapshots(artifactId: string) {
    try {
      const key = this.getSnapshotKey(artifactId);
      localStorage.removeItem(key);
      localStorage.removeItem(this.getVersionKey(artifactId));
    } catch (error) {
      console.error('Error clearing snapshots:', error);
    }
  }
}

// Export a singleton instance
export const localStorageService = new LocalStorageService(); 
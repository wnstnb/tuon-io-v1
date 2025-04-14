'use client';

import React from 'react';
import { Files } from 'lucide-react';
import FileExplorer from './FileExplorer';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LeftPane() {
  const searchParams = useSearchParams();
  const currentArtifactId = searchParams.get('artifactId') || undefined;

  return (
    <div className="left-pane-container">
      <div className="tabs-container single-tab-header">
        <div className="tab active">
          <Files size={16} />
          <span>History</span>
        </div>
      </div>

      <div className="tab-content">
        <div className="tab-panel active">
          <FileExplorer currentArtifactId={currentArtifactId} />
        </div>
      </div>
    </div>
  );
} 
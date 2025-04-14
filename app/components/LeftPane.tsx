'use client';

import React, { useState } from 'react';
// import { FaBars } from 'react-icons/fa'; // Remove react-icons
import MenuIcon from '@mui/icons-material/Menu'; // Import MUI icon
import { FileExplorer } from './FileExplorer';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LeftPane() {
  const searchParams = useSearchParams();
  const currentArtifactId = searchParams.get('artifactId') || undefined;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`left-pane-container h-full flex flex-col flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <div className="p-2 flex items-center flex-shrink-0">
        <button
          onClick={toggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          {/* <FaBars size={16} /> */}
          <MenuIcon fontSize="small" /> { /* Use MUI Icon */}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex-grow overflow-hidden">
          <div className="tab-content h-full">
            <div className="tab-panel active h-full">
              <FileExplorer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
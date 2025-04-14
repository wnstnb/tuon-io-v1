'use client'; // Required for hooks like useState, useEffect

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tree, NodeRendererProps, TreeApi, NodeApi } from 'react-arborist';
// import { useAuth } from '@/app/context/AuthContext'; // Assuming you have an Auth context
import { useSupabase } from '../context/SupabaseContext'; // Correct context based on previous version
import { FolderService, Folder } from '../lib/services/FolderService';
import { ArtifactService, Artifact } from '../lib/services/ArtifactService';
import { useRouter } from 'next/navigation'; // For navigation
// Import icons (e.g., from react-icons)
import { FaFolder, FaFolderOpen, FaFileAlt, FaChevronRight, FaChevronDown } from 'react-icons/fa';
// Import MUI icons
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';

// Define the structure for nodes in the react-arborist tree
interface TreeNodeData {
    id: string; // Unique ID for react-arborist (e.g., 'folder-uuid', 'artifact-uuid')
    originalId: string; // Original UUID from the database
    name: string;
    type: 'folder' | 'artifact';
    children?: TreeNodeData[]; // Only for folders
}

// --- Data Transformation Function ---
function buildTreeData(folders: Folder[], artifacts: Artifact[]): TreeNodeData[] {
    const folderMap = new Map<string, TreeNodeData>();
    const rootNodes: TreeNodeData[] = [];

    // Create nodes for all folders and map them by ID
    folders.forEach(folder => {
        const node: TreeNodeData = {
            id: `folder-${folder.id}`,
            originalId: folder.id,
            name: folder.name,
            type: 'folder',
            children: [], // Initialize children array
        };
        folderMap.set(folder.id, node);
    });

    // Build the hierarchy for folders
    folders.forEach(folder => {
        const node = folderMap.get(folder.id);
        if (!node) return; // Should not happen if mapping is correct

        if (folder.parentId && folderMap.has(folder.parentId)) {
            // Add as child to parent folder
            folderMap.get(folder.parentId)?.children?.push(node);
        } else {
            // Add as a root node (top-level folder)
            rootNodes.push(node);
        }
    });

     // Add artifacts to their respective folders or the root
    artifacts.forEach(artifact => {
        const node: TreeNodeData = {
            id: `artifact-${artifact.id}`,
            originalId: artifact.id,
            name: artifact.title || 'Untitled Artifact', // Use title as name
            type: 'artifact',
        };

        if (artifact.folderId && folderMap.has(artifact.folderId)) {
            // Add as child to the corresponding folder
            folderMap.get(artifact.folderId)?.children?.push(node);
        } else {
            // Add as a root node (unfiled artifact)
            rootNodes.push(node);
        }
    });

    // Sort root nodes and children alphabetically (folders first, then artifacts)
    const sortNodes = (a: TreeNodeData, b: TreeNodeData) => {
      if (a.type === 'folder' && b.type === 'artifact') return -1;
      if (a.type === 'artifact' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    };

    rootNodes.sort(sortNodes);
    folderMap.forEach(folderNode => {
        folderNode.children?.sort(sortNodes);
    });


    return rootNodes;
}


// --- Custom Node Renderer ---
function Node({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
    const Icon = node.data.type === 'folder'
        ? node.isOpen ? FaFolderOpen : FaFolder
        : FaFileAlt;

    return (
        <div
            ref={dragHandle} // Required for drag-and-drop
            style={style} // Includes positioning and default font styles
            // Apply custom classes for spacing, hover, selection, etc.
            // Removed default rounded corners, apply only on hover/select maybe?
            className={`node-container flex items-center ${node.state.isEditing ? 'editing' : ''}`}
            // Main click handler for the row (activates leaves, selects/focuses folders)
            onClick={(e) => {
                // Don't trigger this if the click was on the toggle chevron
                const target = e.target as HTMLElement;
                if (target.closest('.folder-toggle-icon')) return;

                if (node.isLeaf) node.activate();
                if (!node.isLeaf && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                    node.select();
                    node.focus();
                }
            }}
            // Remove double-click toggle from the whole div, only toggle via chevron or explicitly
            // onDoubleClick={() => node.isInternal && node.toggle()}
        >
            {/* Wrapper for content with padding and hover/selection background */} 
            <div
                className={`flex-grow flex items-center space-x-1 min-w-0 px-2 py-1 rounded
                            ${node.state.isSelected ? 'bg-gray-200 dark:bg-slate-700 font-medium' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
            >
                {/* Indentation spacer */}
                <span style={{ width: `${node.level * 12}px` }} className="inline-block flex-shrink-0"></span>

                {/* Folder Toggle Chevron */} 
                <span
                    className={`folder-toggle-icon flex-shrink-0 w-4 h-4 flex items-center justify-center ${!node.isInternal ? 'invisible' : 'cursor-pointer text-gray-500 dark:text-gray-400'}`}
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent row onClick
                        if (node.isInternal) node.toggle();
                    }}
                >
                    {node.isInternal && (node.isOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />)}
                </span>

                {/* Main Icon (Folder/File) */} 
                <Icon className="icon flex-shrink-0 w-4 h-4 text-gray-600 dark:text-gray-400" />

                {/* Name/Input Area */} 
                {node.isEditing ? (
                    <input
                        type="text"
                        defaultValue={node.data.name}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={() => node.reset()} // Cancel edit on blur
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') node.submit(e.currentTarget.value);
                            if (e.key === 'Escape') node.reset();
                        }}
                        autoFocus
                        className="node-edit-input px-1 py-0 border border-blue-400 rounded-sm flex-grow bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                    />
                ) : (
                    <span
                        onDoubleClick={(e) => { e.stopPropagation(); node.edit(); }}
                        className="node-name truncate flex-grow min-w-0 text-sm cursor-default"
                    >
                        {node.data.name}
                    </span> // Edit on double click name
                )}
            </div>
        </div>
    );
}


// --- File Explorer Component ---
export function FileExplorer() {
    // const { user } = useAuth();
    const { user } = useSupabase(); // Use the correct context hook
    const router = useRouter();
    const [treeData, setTreeData] = useState<TreeNodeData[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const treeRef = React.useRef<TreeApi<TreeNodeData>>(null); // Ref to access tree API
    // State for tracking selection count for delete button enablement
    const [selectionCount, setSelectionCount] = useState(0);

    // Fetch initial data
    useEffect(() => {
        if (!user) {
            setTreeData(null); // Clear data if user logs out
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        console.log("FileExplorer: Fetching data for user:", user.id);
        Promise.all([
            FolderService.getUserFolders(user.id),
            ArtifactService.getUserArtifacts(user.id) // Fetch all artifacts
        ])
        .then(([folders, artifacts]) => {
            console.log(`FileExplorer: Fetched ${folders.length} folders and ${artifacts.length} artifacts.`);
            const initialTree = buildTreeData(folders, artifacts);
            setTreeData(initialTree);
        })
        .catch(err => {
            console.error("Error fetching file explorer data:", err);
            setError("Could not load files. Please try again.");
        })
        .finally(() => {
            setLoading(false);
        });

    }, [user]); // Re-fetch if user changes

    // Callback to update selection count state when tree selection changes
    const handleSelectionChange = useCallback((selectedNodes: NodeApi<TreeNodeData>[]) => {
        setSelectionCount(selectedNodes.length);
    }, []); // Empty dependency array - function itself doesn't depend on anything

    // --- Callback Handlers for react-arborist ---

    const handleCreateFolder = useCallback(async () => {
        if (!user) return;

        const folderName = window.prompt("Enter new folder name:");
        if (!folderName || !folderName.trim()) {
            return; // User cancelled or entered empty name
        }

        setError(null); // Clear previous errors

        // Determine parent folder based on selection/focus
        let parentId: string | null = null;
        const focusedNode = treeRef.current?.focusedNode;
        if (focusedNode) {
            if (focusedNode.data.type === 'folder') {
                // If a folder is focused, create inside it
                parentId = focusedNode.data.originalId;
            } else if (focusedNode.data.type === 'artifact' && focusedNode.parent?.data.type === 'folder') {
                // If an artifact is focused, create inside its parent folder
                parentId = focusedNode.parent.data.originalId;
            }
        }
        // If nothing relevant is focused, parentId remains null (root level)

        console.log(`FileExplorer: Creating folder "${folderName}" inside parent: ${parentId || 'root'}`);

        try {
            // Call the service to create the folder
            const newFolder = await FolderService.createFolder(user.id, folderName.trim(), parentId);

            // --- Optimistic Update (Simpler: Refetch) ---
            // For simplicity, we refetch both folders and artifacts. A more optimized
            // approach would be to just fetch folders or even just insert the new node.
            const [folders, artifacts] = await Promise.all([
                FolderService.getUserFolders(user.id),
                ArtifactService.getUserArtifacts(user.id)
            ]);
            setTreeData(buildTreeData(folders, artifacts));

            // Optionally, open the parent folder and focus the new folder
            // This requires finding the new node in the updated treeData
            // treeRef.current?.open(newFolderNode.id);
            // treeRef.current?.focus(newFolderNode.id);

        } catch (err: any) {
            console.error("Error creating folder:", err);
            setError(`Create folder failed: ${err.message || 'Please try again.'}`);
        }
    }, [user, treeData]);

    const handleDeleteSelected = useCallback(async () => {
        if (!user || !treeRef.current) return;

        const selectedNodes = treeRef.current.selectedNodes;
        if (!selectedNodes || selectedNodes.length === 0) {
            alert("No items selected to delete.");
            return;
        }

        const nodeSummary = selectedNodes.length === 1
            ? `"${selectedNodes[0].data.name}"`
            : `${selectedNodes.length} items`;

        if (!window.confirm(`Are you sure you want to delete ${nodeSummary}?`)) {
            return;
        }

        setError(null); // Clear previous errors
        // Maybe set a specific loading state for delete?

        let successCount = 0;
        const errors: string[] = [];
        const originalTreeData = treeData ? JSON.parse(JSON.stringify(treeData)) : null; // For potential rollback

        console.log(`FileExplorer: Deleting ${selectedNodes.length} items.`);

        // Process deletions sequentially to potentially avoid race conditions
        // or hitting DB limits, and handle folder deletion errors correctly.
        for (const node of selectedNodes) {
            try {
                if (node.data.type === 'artifact') {
                    await ArtifactService.deleteArtifact(node.data.originalId);
                    console.log(`Deleted artifact: ${node.data.originalId}`);
                } else if (node.data.type === 'folder') {
                    // FolderService.deleteFolder throws if not empty
                    await FolderService.deleteFolder(node.data.originalId, user.id);
                    console.log(`Deleted folder: ${node.data.originalId}`);
                }
                successCount++;
            } catch (err: any) {
                console.error(`Error deleting ${node.data.type} ${node.data.originalId}:`, err);
                errors.push(`Failed to delete ${node.data.type} "${node.data.name}": ${err.message}`);
                // Optional: Stop on first error?
                // break;
            }
        }

        if (errors.length > 0) {
            setError(`Deletion completed with errors: \n - ${errors.join('\n - ')}`);
        }

        // Refetch data to update the tree after deletion
        // A more optimized approach would remove nodes locally if successful.
        try {
            const [folders, artifacts] = await Promise.all([
                FolderService.getUserFolders(user.id),
                ArtifactService.getUserArtifacts(user.id)
            ]);
            setTreeData(buildTreeData(folders, artifacts));
        } catch (fetchErr: any) {
            console.error("Error refetching data after delete:", fetchErr);
            setError((prev) => (prev ? prev + "\n" : "") + "Failed to refresh file list after deletion.");
            // Rollback UI if refetch fails?
            if (originalTreeData && errors.length > 0) setTreeData(originalTreeData);
        }

    }, [user, treeData]);

    const handleActivate = useCallback((node: NodeApi<TreeNodeData>) => {
        if (node.data.type === 'artifact') {
            console.log(`FileExplorer: Activating artifact: ${node.data.originalId}`);
            router.push(`/editor?artifactId=${node.data.originalId}`);
        }
        // Optional: Handle folder activation differently if needed
    }, [router]);

    const handleMove = useCallback(async ({ dragNodes, parentNode }: { dragNodes: NodeApi<TreeNodeData>[], parentNode: NodeApi<TreeNodeData> | null }) => {
        if (!user) return; // Should not happen if UI hides tree

        const newParentFolderId = parentNode?.data.type === 'folder' ? parentNode.data.originalId : null;
        console.log(`FileExplorer: Moving ${dragNodes.length} items to parent: ${newParentFolderId || 'root'}`);

        // --- TODO: Implement proper optimistic updates for smoother UX --- 
        const originalTreeData = treeData ? JSON.parse(JSON.stringify(treeData)) : null; // Deep copy for rollback

        try {
            for (const node of dragNodes) {
                if (node.data.type === 'artifact') {
                    await ArtifactService.moveArtifact(node.data.originalId, newParentFolderId, user.id);
                } else if (node.data.type === 'folder') {
                    await FolderService.moveFolder(node.data.originalId, newParentFolderId, user.id);
                }
            }
            // If successful, refetch data to ensure consistency
             const [folders, artifacts] = await Promise.all([
                 FolderService.getUserFolders(user.id),
                 ArtifactService.getUserArtifacts(user.id)
             ]);
             setTreeData(buildTreeData(folders, artifacts));

        } catch (err: any) {
            console.error("Error moving item(s):", err);
            setError(`Move failed: ${err.message || 'Please try again.'}`);
             // --- Rollback on Error --- 
             if (originalTreeData) {
                 console.log("Rolling back move operation UI.")
                 setTreeData(originalTreeData);
             }
        }
    }, [user, treeData]); // Dependency on treeData for rollback

     const handleRename = useCallback(async ({ node, name }: { node: NodeApi<TreeNodeData>, name: string }) => {
        if (!user || !name.trim()) {
            node.reset(); // Reset editing state if name is empty
            return;
        }

        const originalName = node.data.name;
        const trimmedName = name.trim();
        console.log(`FileExplorer: Renaming ${node.data.type} ${node.data.originalId} from "${originalName}" to "${trimmedName}"`);

        // Already in editing state, directly proceed to API call
        try {
            if (node.data.type === 'artifact') {
                await ArtifactService.updateArtifactTitle(node.data.originalId, trimmedName, user.id);
            } else if (node.data.type === 'folder') {
                await FolderService.updateFolderName(node.data.originalId, trimmedName, user.id);
            }
            // Success - update the node data in the tree
            node.data.name = trimmedName;
            // No need to setTreeData, react-arborist handles internal update on submit

        } catch (err: any) {
            console.error(`Error renaming ${node.data.type}:`, err);
            setError(`Rename failed: ${err.message || 'Please try again.'}`);
            // Do not revert name here, let user retry or cancel edit
            node.reset(); // Exit editing state on error
        }
     }, [user]);

    // --- Render Logic ---
    if (loading) {
        return <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading files...</div>;
    }
    if (error) {
        return <div className="p-4 text-red-600">Error: {error}</div>;
    }
    if (!user) {
        return <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Please log in.</div>;
    }
    if (!treeData) { // Handle case where data fetch might return null/empty initially
         return <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No files found or loading...</div>;
    }

  return (
        <div className="file-explorer-container h-full w-full overflow-auto text-sm bg-white dark:bg-gray-900 text-black dark:text-white flex flex-col">
            {/* --- Action Button Row --- */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2">
          <button 
                    title="New Folder"
                    onClick={handleCreateFolder}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                    disabled={!user || loading}
                >
                    <CreateNewFolderIcon fontSize="small" />
          </button>
          <button
                    title="Multi-select (use Shift/Ctrl/Meta + Click)"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                    disabled={!user || loading}
                >
                    <LibraryAddCheckIcon fontSize="small" />
          </button>
          <button 
                    title="Delete Selected"
            onClick={handleDeleteSelected}
                    className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-50 disabled:text-gray-400 dark:disabled:text-gray-600"
                    disabled={!user || loading || selectionCount === 0}
                >
                    <DeleteOutlineIcon fontSize="small" />
                </button>
            </div>
            {/* --- Tree Component --- */}
            <div className="flex-grow overflow-auto"> { /* Wrapper div for the tree */}
                <Tree<TreeNodeData>
                    ref={treeRef}
                    data={treeData ?? []}
                    indent={12}         // Reduced indent
                    rowHeight={32}      // Slightly increased row height for padding
                    openByDefault={false}
                    disableDrag={false}
                    disableDrop={false}
                    paddingTop={8}      // Adjusted padding
                    paddingBottom={8}   // Adjusted padding
                    onActivate={handleActivate}
                    onMove={handleMove}
                    onRename={handleRename}
                    onSelect={handleSelectionChange} // Update selection count state
                >
                    {Node}
                </Tree>
        </div>
    </div>
  );
} 

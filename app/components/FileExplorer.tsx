'use client'; // Required for hooks like useState, useEffect

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tree, NodeRendererProps, TreeApi, NodeApi } from 'react-arborist';
// import { useAuth } from '@/app/context/AuthContext'; // Assuming you have an Auth context
import { useSupabase } from '../context/SupabaseContext'; // Correct context based on previous version
import { FolderService, Folder } from '../lib/services/FolderService';
import { ArtifactService, Artifact } from '../lib/services/ArtifactService';
import { useRouter } from 'next/navigation'; // For navigation
// Import icons (e.g., from react-icons)
import { FaFolder, FaFolderOpen, FaFileAlt, FaPlus } from 'react-icons/fa';

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
            style={style}
            className={`node-container px-1 flex items-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded ${node.state.isSelected ? 'bg-blue-100 dark:bg-blue-800' : ''} ${node.state.isEditing ? 'editing' : ''}`}
            onClick={(e) => {
                // Prevent activating folder on single click, allow selecting
                if (node.isLeaf) node.activate();
                // Allow selection without activation for folders
                 if (!node.isLeaf && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                     node.select();
                     node.focus();
                 }
            }}
            onDoubleClick={() => node.isInternal && node.toggle()} // Toggle folders on double click
        >
            {/* Indentation spacer - Adjust multiplier as needed */}
            <span style={{ width: `${node.level * 16}px` }} className="inline-block flex-shrink-0"></span>
            <span className="node-content flex items-center space-x-1 flex-grow min-w-0">
                <Icon className="icon flex-shrink-0 w-4 h-4" />
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
                        className="node-edit-input p-0 border border-blue-400 flex-grow bg-white dark:bg-gray-800 text-black dark:text-white" // Basic styling
                    />
                ) : (
                    <span onDoubleClick={(e) => { e.stopPropagation(); node.edit(); }} className="node-name truncate flex-grow min-w-0">
                        {node.data.name}
                    </span> // Edit on double click name
                )}
            </span>
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
            {/* --- Add Create Folder Button --- */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={handleCreateFolder}
                    className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                    disabled={!user || loading} // Disable if not logged in or loading
                >
                    <FaPlus size={10} />
                    <span>New Folder</span>
                </button>
            </div>
            {/* --- Tree Component --- */}
            <div className="flex-grow overflow-auto"> { /* Wrapper div for the tree */}
                <Tree<TreeNodeData>
                    ref={treeRef}
                    data={treeData ?? []}
                    indent={16} // Indentation per level
                    rowHeight={28} // Height of each row
                    openByDefault={false} // Start with folders closed
                    disableDrag={false} // Enable drag
                    disableDrop={false} // Enable drop
                    paddingTop={10}
                    paddingBottom={10}
                    onActivate={handleActivate}
                    onMove={handleMove}
                    onRename={handleRename}
                    // onDelete={handleDelete} // Add delete handler if needed
                >
                    {/* Pass the custom Node renderer directly */}
                    {Node}
                </Tree>
            </div>
        </div>
    );
}

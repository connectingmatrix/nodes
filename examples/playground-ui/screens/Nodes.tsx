import { useEffect, useMemo, useState } from 'react';
import { Box, Edit, Power, PowerOff, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { SearchBar } from '../components/SearchBar';
import { useToast } from '../components/Toast';
import { useUiDataContext } from '../contexts/AuthSessionContext';
import { deleteUserNode, listUserNodes, updateUserNode } from '@giga/dataloader/client/legacy/dataloaders';
import type { UserNodeRecord, WorkflowUserNodeInput } from '@giga/dataloader/client/legacy/orm';

const sourceCount = (node: UserNodeRecord): number => Object.keys(node.sourceFiles).length;
const fieldCount = (node: UserNodeRecord): number => Object.keys(node.nodeSchema).length;
const statusVariant = (node: UserNodeRecord): 'success' | 'warning' => (node.isActive ? 'success' : 'warning');

const updateInput = (node: UserNodeRecord, isActive: boolean): WorkflowUserNodeInput => ({
    name: node.name,
    slug: node.slug,
    description: node.description || null,
    groupName: node.groupName || null,
    scopeType: node.scopeType,
    scopeId: node.scopeId || null,
    nodeSchema: node.nodeSchema,
    sourceFiles: node.sourceFiles,
    isActive
});

export default function Nodes() {
    const context = useUiDataContext();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [nodes, setNodes] = useState<UserNodeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const loadNodes = () => {
        setLoading(true);
        setError(null);
        void listUserNodes(context)
            .then((result) => {
                setNodes(result.rows);
                setSelectedNode((current) => current || result.rows[0]?.id || null);
            })
            .catch((failure: Error) => setError(failure))
            .finally(() => setLoading(false));
    };

    useEffect(loadNodes, [context]);

    const filteredNodes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return nodes;
        return nodes.filter((node) => node.name.toLowerCase().includes(query) || node.slug.toLowerCase().includes(query) || (node.description || '').toLowerCase().includes(query) || node.scopeLabel.toLowerCase().includes(query));
    }, [nodes, searchQuery]);

    const selectedNodeData = filteredNodes.find((node) => node.id === selectedNode) || filteredNodes[0] || null;

    const deleteNode = async (node: UserNodeRecord) => {
        try {
            await deleteUserNode(context, node.id);
            showToast('success', `Deleted ${node.name}`);
            setSelectedNode(null);
            loadNodes();
        } catch (failure) {
            showToast('error', failure instanceof Error ? failure.message : 'User node delete failed.');
        }
    };

    const toggleNode = async (node: UserNodeRecord) => {
        try {
            await updateUserNode(context, node.id, updateInput(node, !node.isActive));
            showToast('success', `${node.name} ${node.isActive ? 'disabled' : 'enabled'}`);
            loadNodes();
        } catch (failure) {
            showToast('error', failure instanceof Error ? failure.message : 'User node update failed.');
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <LoadingState type="skeleton-list" count={8} />
            </div>
        );
    }

    if (error) return <ErrorState title="Failed to load user nodes" message={error.message} onRetry={loadNodes} />;

    return (
        <div className="min-h-screen bg-background dark:bg-[#0a0a0a]">
            <div className="flex h-screen">
                <div className="w-96 border-r border-border dark:border-[#2a2a2a] overflow-y-auto bg-white dark:bg-[#0f0f0f]">
                    <div className="p-6 border-b border-border dark:border-[#2a2a2a]">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h1 className="text-2xl font-bold dark:text-gray-100">User Nodes</h1>
                                <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">{nodes.length} backend workflow nodes</p>
                            </div>
                            <Button onClick={() => navigate('/node-editor')} size="sm" className="gap-2">
                                <Plus className="w-4 h-4" />
                                New
                            </Button>
                        </div>
                        <SearchBar value={searchQuery} onChange={setSearchQuery} />
                    </div>

                    {filteredNodes.length === 0 ? (
                        <EmptyState icon={Box} title="No user nodes found" description="Create a workflow node or adjust the current filter." action={{ label: 'Create Node', onClick: () => navigate('/node-editor') }} />
                    ) : (
                        <div className="divide-y divide-border dark:divide-[#2a2a2a]">
                            {filteredNodes.map((node) => (
                                <button
                                    key={node.id}
                                    onClick={() => setSelectedNode(node.id)}
                                    className={`w-full text-left p-4 hover:bg-secondary dark:hover:bg-[#1a1a1a] ${selectedNodeData?.id === node.id ? 'bg-secondary/70 dark:bg-[#1a1a1a]' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                            <Box className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold dark:text-gray-100 truncate">{node.name}</h3>
                                                <Badge variant={statusVariant(node)}>{node.isActive ? 'active' : 'inactive'}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground dark:text-gray-400 line-clamp-2 mb-2">{node.description || node.modelId}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-gray-500">
                                                <span>{node.scopeLabel}</span>
                                                <span>·</span>
                                                <span>{sourceCount(node)} files</span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {selectedNodeData ? (
                        <div className="p-8 space-y-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                        <Box className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <h2 className="text-2xl font-bold dark:text-gray-100">{selectedNodeData.name}</h2>
                                            <Badge variant={statusVariant(selectedNodeData)}>{selectedNodeData.isActive ? 'active' : 'inactive'}</Badge>
                                        </div>
                                        <p className="text-muted-foreground dark:text-gray-400 mb-2">{selectedNodeData.description || 'No description saved.'}</p>
                                        <p className="text-sm text-muted-foreground dark:text-gray-500">{selectedNodeData.modelId}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedNodeData.canUpdate && (
                                        <Button variant="outline" onClick={() => toggleNode(selectedNodeData)} className="gap-2">
                                            {selectedNodeData.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                            {selectedNodeData.isActive ? 'Disable' : 'Enable'}
                                        </Button>
                                    )}
                                    {selectedNodeData.canUpdate && (
                                        <Button variant="outline" onClick={() => navigate(`/node-editor?id=${selectedNodeData.id}`)} className="gap-2">
                                            <Edit className="w-4 h-4" />
                                            Edit
                                        </Button>
                                    )}
                                    {selectedNodeData.canDelete && (
                                        <Button variant="outline" onClick={() => deleteNode(selectedNodeData)} className="gap-2 text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                            Delete
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Card>
                                    <p className="text-sm text-muted-foreground">Scope</p>
                                    <p className="font-semibold dark:text-gray-100">{selectedNodeData.scopeLabel}</p>
                                </Card>
                                <Card>
                                    <p className="text-sm text-muted-foreground">Group</p>
                                    <p className="font-semibold dark:text-gray-100">{selectedNodeData.groupName || 'User Nodes'}</p>
                                </Card>
                                <Card>
                                    <p className="text-sm text-muted-foreground">Schema Keys</p>
                                    <p className="font-semibold dark:text-gray-100">{fieldCount(selectedNodeData)}</p>
                                </Card>
                                <Card>
                                    <p className="text-sm text-muted-foreground">Source Files</p>
                                    <p className="font-semibold dark:text-gray-100">{sourceCount(selectedNodeData)}</p>
                                </Card>
                            </div>

                            <Card>
                                <h3 className="font-semibold mb-3 dark:text-gray-100">Source Files</h3>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(selectedNodeData.sourceFiles).map((file) => (
                                        <Badge key={file} variant="default">
                                            {file}
                                        </Badge>
                                    ))}
                                </div>
                            </Card>

                            <Card>
                                <h3 className="font-semibold mb-3 dark:text-gray-100">Node Schema</h3>
                                <pre className="text-xs bg-secondary dark:bg-[#1a1a1a] rounded-lg p-4 overflow-auto max-h-96 dark:text-gray-200">{JSON.stringify(selectedNodeData.nodeSchema, null, 2)}</pre>
                            </Card>
                        </div>
                    ) : (
                        <EmptyState icon={Box} title="No node selected" description="Select a node to view its backend definition." />
                    )}
                </div>
            </div>
        </div>
    );
}

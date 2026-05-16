import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle, FileText, Save, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { MiniAiChat } from '../components/MiniAiChat';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { useToast } from '../components/Toast';
import { useUiDataContext } from '../contexts/AuthSessionContext';
import { createUserNode, loadUserNode, updateUserNode, validateUserNode } from '@/dataloaders';
import { chatRoute } from '../data/chatRoute';
import type { JsonObject, UserNodeRecord, WorkflowNodeValidation, WorkflowUserNodeInput } from '@/orm';

type EditorTab = 'basic' | 'source' | 'validation';

type FormState = {
    name: string;
    slug: string;
    description: string;
    groupName: string;
    isActive: boolean;
    nodeSchemaText: string;
    workerSource: string;
    validateSource: string;
};

const initialForm: FormState = { name: '', slug: '', description: '', groupName: '', isActive: true, nodeSchemaText: '{}', workerSource: '', validateSource: '' };
const textFile = (node: UserNodeRecord, fileName: string): string => {
    const value = node.sourceFiles[fileName];
    return typeof value === 'string' ? value : '';
};

const nodeForm = (node: UserNodeRecord): FormState => ({
    name: node.name,
    slug: node.slug,
    description: node.description || '',
    groupName: node.groupName || '',
    isActive: node.isActive,
    nodeSchemaText: JSON.stringify(node.nodeSchema, null, 2),
    workerSource: textFile(node, 'worker.ts'),
    validateSource: textFile(node, 'validate.ts')
});

const parseSchema = (text: string): JsonObject => {
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Node schema must be a JSON object.');
    return parsed as JsonObject;
};

export default function NodeEditor() {
    const context = useUiDataContext();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const nodeId = searchParams.get('id');
    const [tab, setTab] = useState<EditorTab>('basic');
    const [form, setForm] = useState<FormState>(initialForm);
    const [loading, setLoading] = useState(Boolean(nodeId));
    const [saving, setSaving] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [validation, setValidation] = useState<WorkflowNodeValidation | null>(null);

    useEffect(() => {
        if (!nodeId) {
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        void loadUserNode(context, nodeId)
            .then((node) => {
                if (active) setForm(nodeForm(node));
            })
            .catch((failure: Error) => {
                if (active) setError(failure);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [context, nodeId]);

    const buildInput = (): WorkflowUserNodeInput => {
        const sourceFiles: JsonObject = { 'worker.ts': form.workerSource };
        if (form.validateSource.trim()) sourceFiles['validate.ts'] = form.validateSource;
        return {
            name: form.name,
            slug: form.slug,
            description: form.description || null,
            groupName: form.groupName || null,
            nodeSchema: parseSchema(form.nodeSchemaText),
            sourceFiles,
            isActive: form.isActive
        };
    };

    const updateField = (field: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

    const validateDraft = async () => {
        setValidating(true);
        setValidation(null);
        try {
            const result = await validateUserNode(context, buildInput());
            setValidation(result);
            showToast(result.ok ? 'success' : 'warning', result.ok ? 'Node validation passed' : 'Node validation found issues');
            setTab('validation');
        } catch (failure) {
            const nextError = failure instanceof Error ? failure : new Error('User node validation failed.');
            setValidation({ ok: false, errors: [nextError.message], warnings: [], files: [] });
            setTab('validation');
        } finally {
            setValidating(false);
        }
    };

    const saveNode = async () => {
        setSaving(true);
        try {
            const draft = buildInput();
            const saved = nodeId ? await updateUserNode(context, nodeId, draft) : await createUserNode(context, draft);
            showToast('success', nodeId ? 'Node updated' : 'Node created');
            navigate(`/node-editor?id=${saved.id}`);
        } catch (failure) {
            showToast('error', failure instanceof Error ? failure.message : 'User node save failed.');
        } finally {
            setSaving(false);
        }
    };

    const aiReview = () => {
        navigate(chatRoute(undefined, `Review the workflow user node ${form.name || form.slug || 'draft'} against the backend node package rules. Validate worker.ts, validate.ts, schema, permissions, and runtime safety.`));
    };

    if (loading) {
        return (
            <div className="p-6">
                <LoadingState type="skeleton-card" count={5} />
            </div>
        );
    }

    if (error) return <ErrorState title="Failed to load user node" message={error.message} />;

    return (
        <div className="min-h-screen bg-background dark:bg-[#0a0a0a]">
            <div className="border-b border-border dark:border-[#2a2a2a] bg-white dark:bg-[#0f0f0f]">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold dark:text-gray-100">{nodeId ? 'Edit User Node' : 'Create User Node'}</h1>
                        <p className="text-sm text-muted-foreground dark:text-gray-400">Backend-backed workflow node designer with live validation.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={aiReview} className="gap-2">
                            <Bot className="w-4 h-4" />
                            AI Review
                        </Button>
                        <Button variant="outline" onClick={validateDraft} disabled={validating} className="gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            {validating ? 'Validating' : 'Validate'}
                        </Button>
                        <Button onClick={saveNode} disabled={saving || !form.name.trim() || !form.slug.trim()} className="gap-2">
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving' : 'Save'}
                        </Button>
                    </div>
                </div>
                <div className="px-6 flex gap-1">
                    {(['basic', 'source', 'validation'] as EditorTab[]).map((item) => (
                        <button key={item} onClick={() => setTab(item)} className={`px-4 py-3 text-sm font-medium border-b-2 ${tab === item ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
                            {item.charAt(0).toUpperCase() + item.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-6 max-w-6xl mx-auto space-y-6">
                {tab === 'basic' && (
                    <Card>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block text-sm font-medium dark:text-gray-300">
                                Name
                                <Input className="mt-2" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                            </label>
                            <label className="block text-sm font-medium dark:text-gray-300">
                                Slug
                                <Input className="mt-2" value={form.slug} onChange={(event) => updateField('slug', event.target.value)} />
                            </label>
                            <label className="block text-sm font-medium dark:text-gray-300 md:col-span-2">
                                Description
                                <Textarea className="mt-2 resize-y" value={form.description} onChange={(event) => updateField('description', event.target.value)} rows={3} />
                            </label>
                            <label className="block text-sm font-medium dark:text-gray-300">
                                Group
                                <Input className="mt-2" value={form.groupName} onChange={(event) => updateField('groupName', event.target.value)} />
                            </label>
                            <label className="mt-8 flex items-center gap-2 text-sm font-medium dark:text-gray-300">
                                <Switch checked={form.isActive} onCheckedChange={(checked) => updateField('isActive', checked)} /> Active
                            </label>
                        </div>
                    </Card>
                )}

                {tab === 'source' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <h3 className="font-semibold mb-3 dark:text-gray-100">
                                <FileText className="w-4 h-4 inline mr-2" />
                                Node Schema
                            </h3>
                            <Textarea value={form.nodeSchemaText} onChange={(event) => updateField('nodeSchemaText', event.target.value)} rows={22} className="font-mono text-sm resize-y" />
                        </Card>
                        <Card>
                            <h3 className="font-semibold mb-3 dark:text-gray-100">
                                <FileText className="w-4 h-4 inline mr-2" />
                                worker.ts
                            </h3>
                            <Textarea value={form.workerSource} onChange={(event) => updateField('workerSource', event.target.value)} rows={22} className="font-mono text-sm resize-y" />
                        </Card>
                        <Card className="lg:col-span-2">
                            <h3 className="font-semibold mb-3 dark:text-gray-100">
                                <FileText className="w-4 h-4 inline mr-2" />
                                validate.ts
                            </h3>
                            <Textarea value={form.validateSource} onChange={(event) => updateField('validateSource', event.target.value)} rows={12} className="font-mono text-sm resize-y" />
                        </Card>
                    </div>
                )}

                <MiniAiChat title="Test user node" contextId={nodeId || 'draft-user-node'} seedPrompt={`Test workflow user node ${form.name || form.slug || 'draft'} against schema, permissions, validation, and runtime safety.`} />

                {tab === 'validation' && (
                    <Card>
                        {!validation ? (
                            <p className="text-sm text-muted-foreground dark:text-gray-400">Run backend validation to check schema and source files.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Badge variant={validation.ok ? 'success' : 'danger'}>{validation.ok ? 'valid' : 'needs work'}</Badge>
                                    <span className="text-sm text-muted-foreground">{validation.files.join(', ') || 'No files accepted'}</span>
                                </div>
                                {validation.errors.map((message) => (
                                    <div key={message} className="flex gap-2 text-sm text-red-600">
                                        <AlertTriangle className="w-4 h-4" />
                                        {message}
                                    </div>
                                ))}
                                {validation.warnings.map((message) => (
                                    <div key={message} className="flex gap-2 text-sm text-yellow-700">
                                        <AlertTriangle className="w-4 h-4" />
                                        {message}
                                    </div>
                                ))}
                                {validation.ok && (
                                    <div className="flex gap-2 text-sm text-green-700">
                                        <CheckCircle className="w-4 h-4" />
                                        Backend validation completed successfully.
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                )}
            </div>
        </div>
    );
}

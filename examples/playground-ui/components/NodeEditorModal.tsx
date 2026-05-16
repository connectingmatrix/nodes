import { useState, useEffect } from 'react';
import { X, Hash, Layers, Tag, FileText } from 'lucide-react';
import { Button } from './Button';
import type { TreeNode, TreeNodeType } from './HierarchicalTree';

interface NodeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NodeFormData) => void;
  mode: 'create' | 'edit';
  nodeType: TreeNodeType;
  initialData?: Partial<TreeNode>;
  parentName?: string;
}

export interface NodeFormData {
  name: string;
  slug?: string;
  icon?: string;
  type: TreeNodeType;
  metadata?: {
    postCount?: number;
    memberCount?: number;
    visibility?: string;
  };
}

const nodeTypeLabels: Record<TreeNodeType, string> = {
  channel: 'Channel',
  category: 'Category',
  subject: 'Subject',
  post: 'Post',
};

const nodeTypeIcons: Record<TreeNodeType, React.ComponentType<{ className?: string }>> = {
  channel: Hash,
  category: Layers,
  subject: Tag,
  post: FileText,
};

export function NodeEditorModal({
  isOpen,
  onClose,
  onSave,
  mode,
  nodeType,
  initialData,
  parentName,
}: NodeEditorModalProps) {
  const [formData, setFormData] = useState<NodeFormData>({
    name: '',
    slug: '',
    icon: '',
    type: nodeType,
    metadata: {},
  });

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setFormData({
          name: initialData.name || '',
          slug: '', // Would come from initialData in real implementation
          icon: initialData.icon || '',
          type: nodeType,
          metadata: initialData.metadata || {},
        });
      } else {
        setFormData({
          name: '',
          slug: '',
          icon: '',
          type: nodeType,
          metadata: {},
        });
      }
    }
  }, [isOpen, mode, nodeType, initialData]);

  // Auto-generate slug from name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onSave(formData);
      onClose();
    }
  };

  if (!isOpen) return null;

  const Icon = nodeTypeIcons[nodeType];
  const label = nodeTypeLabels[nodeType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-full max-w-md mx-4 border border-border dark:border-[#2a2a2a]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold dark:text-gray-100">
                {mode === 'create' ? `Create ${label}` : `Edit ${label}`}
              </h2>
              {mode === 'create' && parentName && (
                <p className="text-sm text-muted-foreground dark:text-gray-400">
                  Under: {parentName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary dark:hover:bg-[#2a2a2a] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-gray-200">
              {label} Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 border border-border dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-primary dark:text-gray-100"
              placeholder={`Enter ${label.toLowerCase()} name`}
              required
              autoFocus
            />
          </div>

          {/* Slug - for channels, categories, subjects */}
          {(nodeType === 'channel' || nodeType === 'category' || nodeType === 'subject') && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                Slug *
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-3 py-2 border border-border dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-primary dark:text-gray-100 font-mono text-sm"
                placeholder={`${label.toLowerCase()}-slug`}
                required
              />
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Auto-generated from name. Used in URLs. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>
          )}

          {/* Icon (for channels) */}
          {nodeType === 'channel' && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                Icon (emoji)
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-3 py-2 border border-border dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-primary dark:text-gray-100"
                placeholder="📚"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Optional: Add an emoji to represent this channel
              </p>
            </div>
          )}

          {/* Visibility (for channels and categories) */}
          {(nodeType === 'channel' || nodeType === 'category') && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                Visibility
              </label>
              <select
                value={formData.metadata?.visibility || 'private'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, visibility: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-border dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-primary dark:text-gray-100"
              >
                <option value="private">Private</option>
                <option value="organization">Organization</option>
                <option value="public">Public</option>
              </select>
            </div>
          )}

          {/* Post Content (for posts) */}
          {nodeType === 'post' && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                Content Preview
              </label>
              <textarea
                className="w-full px-3 py-2 border border-border dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-primary dark:text-gray-100 resize-none"
                rows={3}
                placeholder="This will be created as a draft post..."
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {mode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

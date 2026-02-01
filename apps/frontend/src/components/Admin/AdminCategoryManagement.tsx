'use client';

import { useEffect, useState } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, GripVertical, Star } from 'lucide-react';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  slug: string;
  name: string;
  name_zh: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
  is_featured: boolean;
  markets_count: number;
  total_volume: number;
  created_at: string;
  updated_at: string;
}

interface CategoryFormData {
  slug: string;
  name: string;
  nameZh: string;
  description: string;
  icon: string;
  color: string;
  isActive: boolean;
  isFeatured: boolean;
}

const defaultFormData: CategoryFormData = {
  slug: '',
  name: '',
  nameZh: '',
  description: '',
  icon: '',
  color: '#3b82f6',
  isActive: true,
  isFeatured: false,
};

export default function AdminCategoryManagement() {
  const { publicKey } = usePhantomWallet();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(defaultFormData);
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  useEffect(() => {
    fetchCategories();
  }, [publicKey]);

  const fetchCategories = async () => {
    if (!publicKey) return;
    
    try {
      const response = await apiFetch('/api/admin/categories', {
        headers: { 'x-admin-wallet': publicKey.toBase58() },
      });
      const data = await response.json();
      
      if (data.success) {
        setCategories(data.data || []);
      } else {
        toast.error(data.error?.message || 'Failed to fetch categories');
      }
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      slug: category.slug,
      name: category.name,
      nameZh: category.name_zh || '',
      description: category.description || '',
      icon: category.icon || '',
      color: category.color || '#3b82f6',
      isActive: category.is_active,
      isFeatured: category.is_featured,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!publicKey) return;
    
    if (!formData.slug.trim() || !formData.name.trim()) {
      toast.error('Slug and name are required');
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(formData.slug)) {
      toast.error('Slug must contain only lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    setSaving(true);

    try {
      const url = editingCategory
        ? `/api/admin/categories/${editingCategory.id}`
        : '/api/admin/categories';
      
      const method = editingCategory ? 'PATCH' : 'POST';
      
      const body = editingCategory
        ? {
            name: formData.name,
            nameZh: formData.nameZh || null,
            description: formData.description || null,
            icon: formData.icon || null,
            color: formData.color || null,
            isActive: formData.isActive,
            isFeatured: formData.isFeatured,
          }
        : formData;

      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': publicKey.toBase58(),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(editingCategory ? 'Category updated' : 'Category created');
        setDialogOpen(false);
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Failed to save category');
      }
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!publicKey || !categoryToDelete) return;

    setDeleting(categoryToDelete.id);

    try {
      const response = await apiFetch(`/api/admin/categories/${categoryToDelete.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-wallet': publicKey.toBase58() },
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Category deleted');
        setDeleteDialogOpen(false);
        setCategoryToDelete(null);
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Failed to delete category');
      }
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (category: Category) => {
    if (!publicKey) return;

    try {
      const response = await apiFetch(`/api/admin/categories/${category.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': publicKey.toBase58(),
        },
        body: JSON.stringify({ isActive: !category.is_active }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(category.is_active ? 'Category deactivated' : 'Category activated');
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Failed to update category');
      }
    } catch (error: any) {
      console.error('Error toggling category:', error);
      toast.error('Failed to update category');
    }
  };

  const toggleFeatured = async (category: Category) => {
    if (!publicKey) return;

    try {
      const response = await apiFetch(`/api/admin/categories/${category.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': publicKey.toBase58(),
        },
        body: JSON.stringify({ isFeatured: !category.is_featured }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(category.is_featured ? 'Removed from featured' : 'Added to featured');
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Failed to update category');
      }
    } catch (error: any) {
      console.error('Error toggling featured:', error);
      toast.error('Failed to update category');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage market categories. Categories are used to organize and filter markets.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-center">Markets</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-center">Featured</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No categories found. Create your first category.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category, index) => (
                <TableRow key={category.id} className={!category.is_active ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {category.icon && <span className="text-xl">{category.icon}</span>}
                      <div>
                        <div className="font-medium">{category.name}</div>
                        {category.name_zh && (
                          <div className="text-xs text-muted-foreground">{category.name_zh}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{category.slug}</code>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{category.markets_count}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={category.is_active}
                      onCheckedChange={() => toggleActive(category)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleFeatured(category)}
                      className={category.is_featured ? 'text-yellow-500' : 'text-muted-foreground'}
                    >
                      <Star className={`h-4 w-4 ${category.is_featured ? 'fill-current' : ''}`} />
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(category)}
                        disabled={category.markets_count > 0}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Create Category'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'Update category details. Slug cannot be changed.'
                : 'Create a new category for markets.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="e.g., crypto_trading"
                  disabled={!!editingCategory}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="icon">Icon (Emoji)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="e.g., 🎯"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name (English) *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Crypto Trading"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameZh">Name (Secondary)</Label>
                <Input
                  id="nameZh"
                  value={formData.nameZh}
                  onChange={(e) => setFormData({ ...formData, nameZh: e.target.value })}
                  placeholder="e.g., Crypto Trading (Alt)"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this category"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isFeatured"
                  checked={formData.isFeatured}
                  onCheckedChange={(checked) => setFormData({ ...formData, isFeatured: checked })}
                />
                <Label htmlFor="isFeatured">Featured</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{categoryToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting === categoryToDelete?.id}
            >
              {deleting === categoryToDelete?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

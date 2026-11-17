'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { changeCategory, planCategoryChange } from '@/lib/categories'

type Category = {
  id: string
  name: string
}

export function CategoryManagement() {
  const { data: session } = useSession()
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [affectedExercisesCount, setAffectedExercisesCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [session?.supabaseAccessToken])

  const fetchCategories = async () => {
    if (!session?.supabaseAccessToken) return

    setIsLoading(true)
    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      if (error) throw error
      if (data) setCategories(data)
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.supabaseAccessToken || !newCategoryName.trim()) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Check for duplicate
      const existingCategory = categories.find(
        c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase()
      )

      if (existingCategory) {
        setError('A category with this name already exists')
        return
      }

      const { error } = await supabase
        .from('categories')
        .insert([{ name: newCategoryName.trim() }])

      if (error) throw error

      setSuccess('Category added successfully')
      setNewCategoryName('')
      await fetchCategories()
    } catch (err) {
      console.error('Error adding category:', err)
      setError(err instanceof Error ? err.message : 'Failed to add category')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditingName(category.name)
    setError(null)
    setSuccess(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleUpdateCategory = async (category: Category) => {
    const userId = session?.user?.id
    if (!session?.supabaseAccessToken || !userId || !editingName.trim()) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Check for duplicate (excluding current category)
      const existingCategory = categories.find(
        c => c.id !== category.id && c.name.toLowerCase() === editingName.trim().toLowerCase()
      )

      if (existingCategory) {
        setError('A category with this name already exists')
        return
      }

      // Updates the person's own exercises; built-ins become an edited copy.
      await changeCategory(supabase, userId, category, editingName.trim())

      setSuccess('Category updated successfully')
      setEditingId(null)
      setEditingName('')
      await fetchCategories()
    } catch (err) {
      console.error('Error updating category:', err)
      setError(err instanceof Error ? err.message : 'Failed to update category')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDeleteDialog = async (category: Category) => {
    const userId = session?.user?.id
    if (!session?.supabaseAccessToken || !userId) return

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Count the exercises this person sees that use this category
      const { data: exercises, error } = await supabase.from('exercises').select('*')

      if (error) throw error

      const plan = planCategoryChange(exercises ?? [], userId, category.name, null)
      setAffectedExercisesCount(plan.copies.length + plan.updates.length)
      setCategoryToDelete(category)
      setDeleteDialogOpen(true)
    } catch (err) {
      console.error('Error checking affected exercises:', err)
      setError('Failed to check category usage')
    }
  }

  const handleDeleteCategory = async () => {
    const userId = session?.user?.id
    if (!session?.supabaseAccessToken || !userId || !categoryToDelete) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Removes it from the person's exercises; built-ins become an edited copy.
      await changeCategory(supabase, userId, categoryToDelete, null)

      setSuccess('Category deleted successfully')
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
      await fetchCategories()
    } catch (err) {
      console.error('Error deleting category:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete category')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-4">Loading categories...</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Add New Category</h2>
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <div className="flex-1">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" disabled={isSubmitting || !newCategoryName.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Existing Categories</h2>
        {categories.length === 0 ? (
          <p className="text-muted-foreground">No categories yet. Add one above!</p>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                {editingId === category.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 mr-2"
                      disabled={isSubmitting}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleUpdateCategory(category)}
                        disabled={isSubmitting || !editingName.trim()}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={isSubmitting}
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="text-base">
                      {category.name}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(category)}
                        disabled={isSubmitting}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openDeleteDialog(category)}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{categoryToDelete?.name}&quot;?
              {affectedExercisesCount > 0 && (
                <span className="block mt-2 font-semibold text-orange-600 dark:text-orange-400">
                  This category is used by {affectedExercisesCount} exercise{affectedExercisesCount > 1 ? 's' : ''} and will be removed from them.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCategory}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


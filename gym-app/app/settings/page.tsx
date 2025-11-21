'use client'

import { CategoryManagement } from '@/components/CategoryManagement'

export default function SettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">
        Manage your app settings and preferences
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Category Management</h2>
          <p className="text-muted-foreground mb-6">
            Add, edit, or remove exercise categories. Categories help you organize and filter your exercises.
          </p>
          <CategoryManagement />
        </section>

        {/* Future settings sections can be added here */}
      </div>
    </div>
  )
}


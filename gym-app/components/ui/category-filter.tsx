import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface CategoryFilterProps {
  categories: Array<{ id: string; name: string }>
  selectedCategories: string[]
  onToggleCategory: (categoryName: string) => void
  label?: string
  className?: string
}

export function CategoryFilter({
  categories,
  selectedCategories,
  onToggleCategory,
  label = "Filter by Category",
  className = ""
}: CategoryFilterProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Badge
            key={category.id}
            variant={selectedCategories.includes(category.name) ? "default" : "outline"}
            clickable
            selected={selectedCategories.includes(category.name)}
            onClick={() => onToggleCategory(category.name)}
          >
            {category.name}
          </Badge>
        ))}
      </div>
    </div>
  )
} 
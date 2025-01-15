import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SearchInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
}

export function SearchInput({
  id = "search",
  value,
  onChange,
  label = "Search",
  placeholder = "Search...",
  className = "flex-1"
}: SearchInputProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
} 
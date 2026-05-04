"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "./label"

interface FormFieldProps {
  label?: string
  required?: boolean
  error?: string
  hint?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

/** Wrapper that pairs a Label, input, hint text, and inline error message */
function FormField({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <FormMessage>{error}</FormMessage>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

interface FormMessageProps {
  className?: string
  children: React.ReactNode
}

function FormMessage({ className, children }: FormMessageProps) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium text-destructive",
        className
      )}
    >
      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

export { FormField, FormMessage }

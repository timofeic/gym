"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

// Wrapper component to fix focus trap issues with React 19 compatibility
const DrawerWrapper = ({ children }: { children: React.ReactNode }) => {
  // Use ref to track if event listeners are attached
  const listenersAttached = React.useRef(false);
  
  React.useLayoutEffect(() => {
    if (listenersAttached.current) return;
    
    // Hack to remove focus trap after drawer closes
    const handleFocus = (e: FocusEvent) => e.stopImmediatePropagation();
    
    // For React 19, we need to be more aggressive with event capture
    document.addEventListener('focusin', handleFocus, { capture: true });
    document.addEventListener('focusout', handleFocus, { capture: true });
    
    // With React 19, ensure we restore pointer events on body
    const restorePointerEvents = () => {
      // Force enable pointer-events on body when drawer closes
      document.body.style.pointerEvents = 'auto';
    };
    
    // Watch for drawer state changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'data-state' && 
            (mutation.target as HTMLElement).getAttribute('data-state') === 'closed') {
          restorePointerEvents();
        }
      });
    });
    
    // Observe drawers for state changes
    document.querySelectorAll('[data-state]').forEach(el => {
      observer.observe(el, { attributes: true });
    });
    
    listenersAttached.current = true;
    
    return () => {
      document.removeEventListener('focusin', handleFocus, { capture: true });
      document.removeEventListener('focusout', handleFocus, { capture: true });
      observer.disconnect();
    };
  }, []);
  
  return <>{children}</>;
};

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerWrapper>
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    />
  </DrawerWrapper>
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  // Create a unique ID for the description
  const descriptionId = React.useId();
  
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        aria-describedby={undefined} // Explicitly set aria-describedby to undefined to suppress any warnings
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
        {children}
        {/* Always include a hidden description to satisfy accessibility requirements */}
        <span id={descriptionId} className="sr-only">
          Drawer content
        </span>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
})
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}

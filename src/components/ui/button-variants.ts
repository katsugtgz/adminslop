import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none aria-busy:pointer-events-none aria-busy:opacity-75 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-warm hover:bg-primary/90 active:translate-y-px active:scale-[0.99]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-warm hover:bg-destructive/90 active:translate-y-px active:scale-[0.99]",
        outline:
          "border border-input bg-background hover:border-accent/40 hover:bg-accent hover:text-accent-foreground hover:shadow-warm active:translate-y-px active:scale-[0.99]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:translate-y-px active:scale-[0.99]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:translate-y-px active:scale-[0.99]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    compoundVariants: [
      // Mobile-first A11Y: every interactive variant gets a 44x44 CSS-pixel
      // tap target (WCAG 2.5.8 AAA / Apple HIG). `link` is exempt because it
      // renders as inline text.
      {
        variant: ["default", "destructive", "outline", "secondary", "ghost"],
        className: "min-h-11 min-w-11",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

/**
 * UI primitive library barrel. Import everything page-side from "@/components/ui".
 *
 *   import { Button, Card, Field, Input, useToast } from "@/components/ui";
 */

// utilities
export { cn } from "./cn";
export type { ClassValue } from "./cn";

// icon (pre-built foundation module, re-exported for convenience)
export { Icon } from "./Icon";
export type { IconName, IconProps } from "./Icon";

// primitives
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Card, CardHeader, CardBody, CardFooter } from "./Card";
export type { CardProps } from "./Card";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Label } from "./Label";
export type { LabelProps } from "./Label";

export { Field } from "./Field";
export type { FieldProps } from "./Field";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeVariant } from "./Badge";

export { Dialog } from "./Dialog";
export type { DialogProps } from "./Dialog";

export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";

export { Drawer } from "./Drawer";
export type { DrawerProps, DrawerSide } from "./Drawer";

export { ToastProvider, useToast } from "./Toast";
export type { ToastOptions, ToastVariant } from "./Toast";

export { Skeleton, SkeletonText } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedOption } from "./SegmentedControl";

export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { ResponsiveTable } from "./ResponsiveTable";
export type { ResponsiveTableProps, Column } from "./ResponsiveTable";

export { ErrorBoundary } from "./ErrorBoundary";
export type { ErrorBoundaryProps } from "./ErrorBoundary";

export { ConnectionStatus } from "./ConnectionStatus";
export type { ConnectionStatusProps } from "./ConnectionStatus";

export { UserMenu } from "./UserMenu";
export type { UserMenuProps } from "./UserMenu";

// hooks
export { useFocusTrap } from "./useFocusTrap";
export { useLockBodyScroll } from "./useLockBodyScroll";

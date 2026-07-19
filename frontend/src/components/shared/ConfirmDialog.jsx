import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Shared confirmation dialog replacing window.confirm(). Base-ui provides the
// alertdialog role, focus trap, and Escape handling; styling stays in the
// project token vocabulary. `app-surface` on the content keeps portaled
// markup theme-correct (portals mount outside the app shell).
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
}) {
  const handleConfirm = async () => {
    await onConfirm?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent aria-modal="true" className="app-surface w-full gap-4 bg-surface p-6 text-ink shadow-pop sm:max-w-sm">
        <AlertDialogHeader className="place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-base font-semibold text-ink">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm text-ink-muted">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 -mb-0 flex-row justify-end gap-3 rounded-none border-0 bg-transparent p-0">
          <button type="button" onClick={() => onOpenChange(false)} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={destructive ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

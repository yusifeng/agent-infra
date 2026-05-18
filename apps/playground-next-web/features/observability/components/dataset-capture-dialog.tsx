import type { DatasetDto, RunDto } from '@agent-infra/contracts';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  captureDatasetExampleFromRunResponse,
  createDatasetResponse,
  fetchDatasetsResponse,
  type PlaygroundThreadDto
} from '@/features/durable-chat/repo/chat-api';

import { formatShortId } from '../service/format';

type DatasetCaptureDialogProps = {
  open: boolean;
  selectedRun: RunDto;
  selectedThread: PlaygroundThreadDto | null;
  onOpenChange: (open: boolean) => void;
};

type CaptureMode = 'existing' | 'create';

export function DatasetCaptureDialog({ open, selectedRun, selectedThread, onOpenChange }: DatasetCaptureDialogProps) {
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [mode, setMode] = useState<CaptureMode>('existing');
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ datasetId: string; exampleId: string } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    setLoadingDatasets(true);
    setError(null);
    setSuccess(null);
    fetchDatasetsResponse(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load datasets (${result.status})`);
        }
        setDatasets(result.data.datasets);
        setSelectedDatasetId((current) =>
          result.data.datasets.some((dataset) => dataset.id === current)
            ? current
            : result.data.datasets[0]?.id || ''
        );
        setMode(result.data.datasets.length > 0 ? 'existing' : 'create');
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setDatasets([]);
          setSelectedDatasetId('');
          setMode('create');
          setError(loadError instanceof Error ? loadError.message : 'Failed to load datasets');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDatasets(false);
        }
      });

    return () => controller.abort();
  }, [open]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );

  const canSubmit = !submitting && !loadingDatasets && (mode === 'existing' ? Boolean(selectedDataset) : newDatasetName.trim().length > 0);

  async function submitCapture() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      let datasetId = selectedDataset?.id ?? '';
      if (mode === 'create') {
        const createResult = await createDatasetResponse({
          name: newDatasetName.trim(),
          visibility: 'private'
        });
        if (!createResult.ok || !createResult.data.dataset) {
          throw new Error(createResult.error ?? `Failed to create dataset (${createResult.status})`);
        }
        datasetId = createResult.data.dataset.id;
        setDatasets((current) => [createResult.data.dataset!, ...current]);
        setSelectedDatasetId(datasetId);
      }

      const captureResult = await captureDatasetExampleFromRunResponse(datasetId, {
        sourceRunId: selectedRun.id
      });
      if (!captureResult.ok || !captureResult.data.example) {
        throw new Error(captureResult.error ?? `Failed to capture run (${captureResult.status})`);
      }

      setSuccess({
        datasetId,
        exampleId: captureResult.data.example.id
      });
      setMode('existing');
      setNewDatasetName('');
    } catch (captureError: unknown) {
      setError(captureError instanceof Error ? captureError.message : 'Failed to capture run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-xl border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)]">
        <DialogHeader>
          <DialogTitle>Capture Run</DialogTitle>
          <DialogDescription className="sr-only">
            Capture the selected run into a dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3 text-sm md:grid-cols-2">
            <div className="min-w-0">
              <div className="text-xs text-[var(--chat-muted)]">Run</div>
              <div className="mt-1 truncate font-mono font-medium">{formatShortId(selectedRun.id, 18)}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[var(--chat-muted)]">Status</div>
              <div className="mt-1 truncate font-medium">{selectedRun.status}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[var(--chat-muted)]">Runtime</div>
              <div className="mt-1 truncate font-medium">{selectedRun.provider ?? 'unknown'} / {selectedRun.model ?? 'unknown'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[var(--chat-muted)]">Thread</div>
              <div className="mt-1 truncate font-medium">{selectedThread?.title ?? 'Untitled thread'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[color:var(--chat-border)] text-sm font-medium">
            <button
              type="button"
              className={mode === 'existing' ? 'bg-[var(--chat-brand-accent-soft)] px-3 py-2 text-[var(--chat-accent)]' : 'px-3 py-2 text-[var(--chat-muted)]'}
              onClick={() => setMode('existing')}
              disabled={datasets.length === 0}
            >
              Existing
            </button>
            <button
              type="button"
              className={mode === 'create' ? 'bg-[var(--chat-brand-accent-soft)] px-3 py-2 text-[var(--chat-accent)]' : 'px-3 py-2 text-[var(--chat-muted)]'}
              onClick={() => setMode('create')}
            >
              Create
            </button>
          </div>

          {mode === 'existing' ? (
            <label className="block text-sm">
              <span className="text-xs text-[var(--chat-muted)]">Dataset</span>
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none"
                value={selectedDatasetId}
                onChange={(event) => setSelectedDatasetId(event.target.value)}
                disabled={loadingDatasets || datasets.length === 0}
              >
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block truncate text-xs text-[var(--chat-muted)]">
                {selectedDataset ? `Selected ${selectedDataset.name}` : 'No dataset available'}
              </span>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-xs text-[var(--chat-muted)]">Dataset Name</span>
              <Input
                className="mt-1 rounded-lg border-[color:var(--chat-border)] bg-[var(--chat-bg)]"
                value={newDatasetName}
                onChange={(event) => setNewDatasetName(event.target.value)}
                placeholder="Regression examples"
              />
            </label>
          )}
          {error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
          {success ? (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--chat-status-success-bg)] px-3 py-2 text-sm text-[var(--chat-status-success-text)]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                Captured example <span className="font-mono">{formatShortId(success.exampleId, 12)}</span> in dataset <span className="font-mono">{formatShortId(success.datasetId, 12)}</span>.
                {' '}
                <a
                  className="font-medium underline underline-offset-2"
                  href={`/observability/datasets?datasetId=${encodeURIComponent(success.datasetId)}&exampleId=${encodeURIComponent(success.exampleId)}`}
                >
                  Review example
                </a>
              </span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button onClick={() => void submitCapture()} disabled={!canSubmit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

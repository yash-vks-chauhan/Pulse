'use client';

import Papa from 'papaparse';
import { useRef, useState } from 'react';

/**
 * Reviewer-usable ingest: upload a CSV of customers or orders, preview it,
 * and stream it into the ingestion API in batches of 500. Parsing happens in
 * the browser; rows go to a server-side proxy that holds the API key.
 */

type DatasetType = 'customers' | 'orders';

const COLUMNS: Record<DatasetType, { required: string[]; optional: string[] }> = {
  customers: {
    required: ['external_id', 'name'],
    optional: ['email', 'phone', 'city', 'tags (semicolon-separated)'],
  },
  orders: {
    required: ['external_id', 'customer_external_id', 'amount', 'ordered_at (ISO 8601)'],
    optional: ['source'],
  },
};

const BATCH_SIZE = 500;

interface UploadState {
  status: 'idle' | 'parsing' | 'uploading' | 'done' | 'error';
  fileName?: string;
  totalRows?: number;
  uploadedRows?: number;
  upserted?: number;
  errors?: Array<{ external_id?: string; path?: string; reason?: string; message?: string }>;
  message?: string;
}

function toCustomerRow(raw: Record<string, string>) {
  return {
    external_id: raw['external_id']?.trim(),
    name: raw['name']?.trim(),
    email: raw['email']?.trim() || undefined,
    phone: raw['phone']?.trim() || undefined,
    city: raw['city']?.trim() || undefined,
    tags: raw['tags']
      ? raw['tags']
          .split(';')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined,
  };
}

function toOrderRow(raw: Record<string, string>) {
  return {
    external_id: raw['external_id']?.trim(),
    customer_external_id: raw['customer_external_id']?.trim(),
    amount: Number(raw['amount']),
    ordered_at: raw['ordered_at']?.trim(),
    source: raw['source']?.trim() || 'csv',
  };
}

export default function DataPage() {
  const [datasetType, setDatasetType] = useState<DatasetType>('customers');
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setState({ status: 'parsing', fileName: file.name });

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        const rows =
          datasetType === 'customers'
            ? parsed.data.map(toCustomerRow)
            : parsed.data.map(toOrderRow);
        if (rows.length === 0) {
          setState({ status: 'error', message: 'No data rows found in the CSV.' });
          return;
        }

        setState({
          status: 'uploading',
          fileName: file.name,
          totalRows: rows.length,
          uploadedRows: 0,
        });

        let upserted = 0;
        const errors: NonNullable<UploadState['errors']> = [];
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const response = await fetch('/api/ingest', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: datasetType, rows: batch }),
          });
          const body = await response.json();
          if (!response.ok) {
            const issues = Array.isArray(body.issues) ? body.issues : [];
            setState({
              status: 'error',
              message: `Batch ${i / BATCH_SIZE + 1} rejected (${response.status}): ${body.error ?? 'unknown error'}`,
              errors: issues.slice(0, 10),
            });
            return;
          }
          upserted += body.upserted ?? 0;
          if (Array.isArray(body.errors)) errors.push(...body.errors);
          setState((prev) => ({
            ...prev,
            uploadedRows: Math.min(i + BATCH_SIZE, rows.length),
          }));
        }

        setState({
          status: 'done',
          fileName: file.name,
          totalRows: rows.length,
          upserted,
          errors: errors.slice(0, 20),
        });
      },
      error: (error) => setState({ status: 'error', message: `CSV parse failed: ${error.message}` }),
    });
  }

  const columns = COLUMNS[datasetType];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Data ingest</h1>
      <p className="mt-2 text-sm text-slate-600">
        Upload customers or orders as CSV. Rows are validated server-side, encrypted where they
        contain personal data, and upserted idempotently — re-uploading the same file is always
        safe.
      </p>

      <div className="mt-6 flex gap-2">
        {(['customers', 'orders'] as const).map((type) => (
          <button
            key={type}
            onClick={() => {
              setDatasetType(type);
              setState({ status: 'idle' });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
              datasetType === type
                ? 'bg-pulse-600 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <p className="font-medium">Expected columns</p>
        <p className="mt-1 text-slate-600">
          Required: <code className="rounded bg-slate-100 px-1">{columns.required.join(', ')}</code>
        </p>
        <p className="mt-1 text-slate-600">
          Optional: <code className="rounded bg-slate-100 px-1">{columns.optional.join(', ')}</code>
        </p>
      </div>

      <div
        className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center hover:border-pulse-500"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = '';
          }}
        />
        <p className="text-sm font-medium text-slate-700">
          Drop a {datasetType} CSV here, or click to choose a file
        </p>
        <p className="mt-1 text-xs text-slate-500">Batched in chunks of {BATCH_SIZE} rows</p>
      </div>

      {state.status !== 'idle' && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm">
          {state.status === 'parsing' && <p>Parsing {state.fileName}…</p>}
          {state.status === 'uploading' && (
            <p>
              Uploading {state.fileName}: {state.uploadedRows}/{state.totalRows} rows…
            </p>
          )}
          {state.status === 'done' && (
            <div>
              <p className="font-medium text-emerald-700">
                ✓ Upserted {state.upserted} of {state.totalRows} rows from {state.fileName}
              </p>
              {state.errors && state.errors.length > 0 && (
                <div className="mt-2 text-rose-700">
                  <p className="font-medium">{state.errors.length} rows rejected (first shown):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {state.errors.map((error, index) => (
                      <li key={index}>
                        {error.external_id ?? error.path ?? `row ${index}`}:{' '}
                        {error.reason ?? error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {state.status === 'error' && (
            <div className="text-rose-700">
              <p className="font-medium">✗ {state.message}</p>
              {state.errors && state.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {state.errors.map((error, index) => (
                    <li key={index}>
                      {error.path}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

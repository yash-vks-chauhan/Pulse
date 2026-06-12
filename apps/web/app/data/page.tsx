'use client';

import { CheckCircle2, FileUp, ShoppingCart, Users, XCircle } from 'lucide-react';
import Papa from 'papaparse';
import { useRef, useState } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

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
  const progress =
    state.status === 'uploading' && state.totalRows
      ? Math.round(((state.uploadedRows ?? 0) / state.totalRows) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Data ingest</h1>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Upload customers or orders as CSV. Rows are validated server-side, encrypted where they
        contain personal data, and upserted idempotently — re-uploading the same file is always
        safe.
      </p>

      <Tabs
        value={datasetType}
        onValueChange={(value) => {
          setDatasetType(value as DatasetType);
          setState({ status: 'idle' });
        }}
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="customers">
            <Users />
            Customers
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ShoppingCart />
            Orders
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mt-4">
        <CardContent className="p-5 text-sm">
          <p className="font-medium">Expected columns</p>
          <p className="mt-1.5 text-muted-foreground">
            Required:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {columns.required.join(', ')}
            </code>
          </p>
          <p className="mt-1 text-muted-foreground">
            Optional:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {columns.optional.join(', ')}
            </code>
          </p>
        </CardContent>
      </Card>

      <div
        className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-card p-12 text-center transition-colors hover:border-ring/60 hover:bg-muted/30"
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
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <FileUp className="h-5 w-5 text-muted-foreground" />
        </span>
        <p className="mt-4 text-sm font-medium">
          Drop a {datasetType} CSV here, or click to choose a file
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Batched in chunks of {BATCH_SIZE} rows
        </p>
      </div>

      {state.status !== 'idle' && (
        <Card className="mt-4">
          <CardContent className="p-5 text-sm">
            {state.status === 'parsing' && <p>Parsing {state.fileName}…</p>}
            {state.status === 'uploading' && (
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="font-medium">Uploading {state.fileName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {state.uploadedRows}/{state.totalRows} rows
                  </p>
                </div>
                <Progress value={progress} className="mt-3" />
              </div>
            )}
            {state.status === 'done' && (
              <div>
                <p className="flex items-center gap-2 font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Upserted {state.upserted} of {state.totalRows} rows from {state.fileName}
                </p>
                {state.errors && state.errors.length > 0 && (
                  <div className="mt-3 text-destructive">
                    <p className="font-medium">
                      {state.errors.length} rows rejected (first shown):
                    </p>
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
              <div className="text-destructive">
                <p className="flex items-center gap-2 font-medium">
                  <XCircle className="h-4 w-4" />
                  {state.message}
                </p>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

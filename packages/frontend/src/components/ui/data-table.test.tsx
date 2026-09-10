import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataTable, type Column } from './data-table';

interface Row {
  id: string;
  to: string;
  status: string;
}

const ROWS: Row[] = [
  { id: '1', to: 'ana@example.com', status: 'Sent' },
  { id: '2', to: 'bo@example.com', status: 'Held' },
];

const COLUMNS: Column<Row>[] = [
  { key: 'to', header: 'Recipient', cell: (r) => r.to, primary: true },
  { key: 'status', header: 'Status', cell: (r) => r.status },
];

function setup(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(<DataTable rows={ROWS} columns={COLUMNS} getRowKey={(r) => r.id} {...props} />);
}

describe('DataTable', () => {
  it('renders a header cell and a body cell per column', () => {
    setup();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Recipient' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    // Header row + one row per record.
    expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1);
  });

  it('navigates via a real link rather than a click handler', () => {
    setup({ rowHref: (r) => `/messages/${r.id}`, getRowLabel: (r) => `Message to ${r.to}` });
    const link = screen.getAllByRole('link', { name: 'Message to ana@example.com' })[0];
    expect(link).toHaveAttribute('href', '/messages/1');
  });

  it('emits exactly one link per row so the row is not read twice', () => {
    setup({ rowHref: (r) => `/messages/${r.id}`, getRowLabel: (r) => `Message to ${r.to}` });
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('link')).toHaveLength(ROWS.length);
  });

  it('renders no link when rowHref is omitted', () => {
    setup();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the error slot instead of the empty slot when a load failed', () => {
    // The regression this guards: an unreachable API rendering "No messages
    // yet", which tells the operator to go and send mail that already sent.
    setup({ rows: [], error: <p>Could not load messages</p>, empty: <p>No messages yet</p> });
    expect(screen.getByText('Could not load messages')).toBeInTheDocument();
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument();
  });

  it('shows the empty slot only when the load genuinely returned nothing', () => {
    setup({ rows: [], empty: <p>No messages yet</p> });
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('announces loading once, not once per placeholder row', () => {
    setup({ loading: true, loadingRows: 4 });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('stays free of client-only APIs so Server Components can render it', () => {
    // Posta fetches on the server in 13 of its routes and `columns[].cell`
    // is a function, which cannot cross the server/client boundary. If this
    // module ever gains "use client" or a hook, those pages break at build
    // time with an unhelpful serialisation error, so assert it here instead.
    const source = readFileSync(join(import.meta.dirname, 'data-table.tsx'), 'utf8');
    // Anchored to the start of a line: the file's own doc comment discusses
    // the directive, and matching that text would fail the check forever.
    expect(source).not.toMatch(/^\s*["']use client["']/m);
    expect(source).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref)\s*\(/);
    expect(source).not.toMatch(/\bonClick=|onKeyDown=/);
  });
});

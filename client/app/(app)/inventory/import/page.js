'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { canEdit } from '@/lib/format';
import { useUser } from '@/components/AppShell';
import { Alert } from '@/components/ui';

const COLUMNS = ['category', 'productId', 'name', 'company', 'quantity', 'lowStockThreshold', 'wholesalePrice', 'retailPrice'];
const TEMPLATE = `${COLUMNS.join(',')}
gem,4013,Gamala,,15,12,180,220
non_gem,,Super Container 1,Aristo,40,12,70,90
non_gem,N001,Venus Cutlery,Aristo,45,12,85,120
`;

// Small CSV reader that handles quoted cells, doubled quotes and CRLF line ends.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function toObjects(rows) {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c.toLowerCase())]));
  if (index.category < 0 || index.name < 0) throw new Error('The first row must be a header with at least: category, name');
  return rows.slice(1).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, index[c] >= 0 ? (r[index[c]] || '').trim() : ''])));
}

export default function ImportPage() {
  const user = useUser();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!canEdit(user)) return <Alert>You do not have permission to import products.</Alert>;

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    setRows(null);
    setCheck(null);
    setDone(null);
    setProblems([]);
    setError('');
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = toObjects(parseCsv(await file.text()));
      if (parsed.length === 0) throw new Error('The file has a header but no product rows');
      setRows(parsed);
      await run(parsed, true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function run(list, dryRun) {
    setBusy(true);
    setError('');
    setProblems([]);
    try {
      const d = await api('/products/import', { method: 'POST', body: { rows: list, dryRun } });
      if (dryRun) setCheck(d);
      else setDone(d);
    } catch (err) {
      setError(err.message);
      if (err.problems) setProblems(err.problems);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import products</h1>
          <p className="sub">
            <Link href="/inventory" className="link-btn">
              ← Back to inventory
            </Link>
          </p>
        </div>
      </div>

      <section className="card" style={{ maxWidth: 760 }}>
        <h2>1. Choose a CSV file</h2>
        <p className="muted">
          Columns: <code>{COLUMNS.join(', ')}</code>. Category is <code>gem</code> or <code>non_gem</code>. Gem items need a Product ID. Non-Gem items need a company
          (use <code>Local / Unbranded</code> for unbranded). Missing companies are created. Nothing is saved unless every row passes.
        </p>
        <p>
          <a className="link-btn" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="products-template.csv">
            Download a template
          </a>
        </p>
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={onFile} />
      </section>

      <Alert>{error}</Alert>
      {problems.length > 0 && (
        <section className="card card-flush" style={{ maxWidth: 760 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p, i) => (
                  <tr key={`${p.row}-${i}`}>
                    <td>{p.row}</td>
                    <td>{p.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {check && !done && (
        <section className="card" style={{ maxWidth: 760 }}>
          <h2>2. Confirm</h2>
          <p>
            <strong>{fileName}</strong> is valid: {check.count} product{check.count === 1 ? '' : 's'} will be added.
            {check.newCompanies.length > 0 && ` New companies: ${check.newCompanies.join(', ')}.`}
          </p>
          <button className="btn" disabled={busy} onClick={() => run(rows, false)}>
            {busy ? 'Importing…' : `Import ${check.count} products`}
          </button>
        </section>
      )}

      {done && (
        <Alert kind="ok">
          Imported {done.count} products. <Link href="/inventory" className="link-btn">View inventory</Link>
        </Alert>
      )}
    </>
  );
}

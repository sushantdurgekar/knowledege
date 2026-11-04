import { useState } from 'react';
import { FormMessage } from '../../components/forms';
import { downloadVault, VAULT_COMMAND, type VaultCard } from '../../lib/vault-export';

/**
 * "Export to my Knowledge vault": downloads the cards as srs.py JSON and shows the one command
 * that adds them to `practice/srs/cards.jsonl` (ids already in the deck are skipped).
 */
export function VaultExport({
  name,
  load,
  label = 'Export to my Knowledge vault',
}: {
  /** File name stem, e.g. `my-review-deck`. */
  name: string;
  /** The cards to export (may fetch them first). */
  load: () => VaultCard[] | Promise<VaultCard[]>;
  label?: string;
}) {
  const [file, setFile] = useState<{ name: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const cards = await load();
      if (!cards.length) {
        setError('There are no question cards to export yet.');
        return;
      }
      setFile({ name: downloadVault(name, cards), count: cards.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-export">
      <button type="button" className="btn" disabled={busy} onClick={run}>
        {busy ? 'Preparing…' : label}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {file && (
        <div className="vault-export__done" role="status">
          <p>
            Saved <strong>{file.name}</strong> ({file.count} cards). In your Knowledge vault folder, run:
          </p>
          <pre className="vault-export__cmd">
            <code>
              {VAULT_COMMAND} {file.name}
            </code>
          </pre>
          <p className="muted small">
            Use the file’s full path if it is still in Downloads. Cards already in the deck are skipped, so exporting again is safe.
          </p>
        </div>
      )}
    </div>
  );
}

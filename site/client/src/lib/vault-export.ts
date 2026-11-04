// Review cards out to the Knowledge vault: a JSON list that the pro-instructor deck manager reads
//
//   python .claude/skills/pro-instructor/scripts/srs.py --deck-file practice/srs/cards.jsonl \
//     add --json-file <downloaded file>
//
// srs.py needs id, front and back; it fills ef/interval/reps/lapses/due/created when they are
// missing and skips ids it already has, so exporting twice never duplicates a card.
import { download, slugify } from './quiz-doc';
import type { Card } from './quiz';
import type { DeckCard } from './quiz-history';

export interface VaultCard {
  id: string;
  deck: string;
  track: 'technical';
  front: string;
  back: string;
  tags: string[];
  source: string;
  ef?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  due?: string; // YYYY-MM-DD
}

const LETTERS = 'ABCDEFGH';
const MAX_SLUG = 40;

/** `quiz-<title>`: one vault deck per quiz. */
export const vaultDeck = (title: string) => `quiz-${slugify(title).slice(0, MAX_SLUG).replace(/-$/, '')}`;

/** A short stable hash, so the same question always gets the same vault id. */
function hash(text: string): string {
  let h = 5381;
  for (const ch of text) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

export const vaultId = (title: string, front: string) => `${vaultDeck(title)}-${hash(front)}`;

const isoDay = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Front with the options listed (A. ..., B. ...) for choice questions, so the card stands alone. */
function front(card: Pick<Card, 'type' | 'front' | 'options'>): string {
  if ((card.type === 'single' || card.type === 'multi') && card.options?.length) {
    const lines = card.options.map((o, i) => `${LETTERS[i] ?? i + 1}. ${o}`);
    return `${card.front}\n${lines.join('\n')}`;
  }
  return card.front;
}

const back = (card: Pick<Card, 'back' | 'explain'>) => (card.explain ? `${card.back}\n\n${card.explain}` : card.back);

/** The player's own review deck, with its schedule so the vault carries on where the site was. */
export function deckToVault(cards: DeckCard[]): VaultCard[] {
  return cards
    .filter((c) => c.type !== 'slide' && c.type !== 'poll')
    .map((c) => ({
      id: vaultId(c.quiz, c.front),
      deck: vaultDeck(c.quiz),
      track: 'technical' as const,
      front: front(c),
      back: back(c),
      tags: ['study-hubs', 'live-quiz', ...(c.lapses > 0 ? ['missed'] : [])],
      source: `Study Hubs quiz: ${c.quiz}`,
      ef: c.ef,
      interval: c.interval,
      reps: c.reps,
      lapses: c.lapses,
      due: isoDay(c.due),
    }));
}

export interface RoomCardStats {
  answered: number;
  correct: number;
}

/**
 * A room's questions for the host: every card, new to the vault (due today). Questions most of
 * the room missed are tagged `missed-by-room`, so they can be drilled first.
 */
export function roomToVault(title: string, cards: (Card & { index?: number })[], stats: Map<number, RoomCardStats>): VaultCard[] {
  return cards
    .filter((c) => c.type !== 'slide' && c.type !== 'poll')
    .map((c) => {
      const s = c.index === undefined ? undefined : stats.get(c.index);
      const hard = !!s && s.answered > 0 && s.correct / s.answered < 0.5;
      return {
        id: vaultId(title, c.front),
        deck: vaultDeck(title),
        track: 'technical' as const,
        front: front(c),
        back: back(c),
        tags: ['study-hubs', 'live-quiz', ...(hard ? ['missed-by-room'] : [])],
        source: `Study Hubs quiz: ${title}`,
      };
    });
}

export const VAULT_COMMAND =
  'python .claude/skills/pro-instructor/scripts/srs.py --deck-file practice/srs/cards.jsonl add --json-file';

/** Save the cards as a .json file named after the deck. */
export function downloadVault(name: string, cards: VaultCard[]): string {
  const file = `${name}-vault-cards.json`;
  download(file, `${JSON.stringify(cards, null, 2)}\n`, 'application/json');
  return file;
}

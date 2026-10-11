import { money } from '@/lib/format';
import { adToBs, longBs } from '@/lib/bs';

// A balance is { amount, side: 'Dr' | 'Cr' | '' }.
export function Balance({ value }) {
  if (!value || !value.side) return <span className="muted">Nil</span>;
  return (
    <span className={value.side === 'Dr' ? 'bal-dr' : 'bal-cr'}>
      {money(value.amount)} {value.side}
    </span>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Is this account paid up, waiting for its due date, or late?
// due = { status: 'overdue' | 'due' | 'clear', outstanding, dueDate (YYYY-MM-DD), days }
export function DuePill({ due, type }) {
  if (!due || due.status === 'clear') return <span className="pill pill-due-clear">Settled</span>;
  const dueBs = longBs(adToBs(due.dueDate));
  const owed = type === 'vendor' ? 'to pay' : 'to receive';
  if (due.status === 'overdue') {
    return (
      <>
        <span className="pill pill-due-overdue">Overdue {plural(due.days, 'day')}</span>
        <span className="sub-line">
          {money(due.outstanding)} {owed}, was due {dueBs}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="pill pill-due-due">{due.days === 0 ? 'Due today' : `Due in ${plural(due.days, 'day')}`}</span>
      <span className="sub-line">
        {money(due.outstanding)} {owed} by {dueBs}
      </span>
    </>
  );
}

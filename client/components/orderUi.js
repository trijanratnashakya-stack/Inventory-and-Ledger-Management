const LABEL = { open: 'Open', received: 'Received', cancelled: 'Cancelled' };

export function OrderPill({ status }) {
  return <span className={`pill pill-order-${status}`}>{LABEL[status] || status}</span>;
}

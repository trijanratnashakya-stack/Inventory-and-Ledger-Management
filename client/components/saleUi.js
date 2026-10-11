const STATUS_LABEL = { completed: 'Completed', voided: 'Voided' };

export function SaleStatusPill({ status }) {
  return <span className={`pill pill-sale-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

const PAYMENT_LABEL = {
  cash: 'Cash',
  credit: 'Credit',
  bank: 'Bank Transfer',
  partial: 'Partial',
};

export function PaymentTypePill({ type }) {
  return <span className={`pill pill-pay-${type}`}>{PAYMENT_LABEL[type] || type}</span>;
}

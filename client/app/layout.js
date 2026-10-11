import './globals.css';

export const metadata = {
  title: 'Inventory & Price Management',
  description: 'Private inventory, stock status and price list management.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

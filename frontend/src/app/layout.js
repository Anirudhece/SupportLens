import './globals.css';

export const metadata = {
  title: 'SupportLens Technical Status',
  description: 'SupportLens Milestone 0 service connectivity status'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

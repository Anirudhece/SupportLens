import './globals.css';

export const metadata = {
  title: 'SupportLens',
  description: 'Production RAG knowledge assistant'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

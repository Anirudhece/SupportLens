import Link from 'next/link';

export default function AppNav() {
  return <nav className="app-nav" aria-label="Primary"><Link href="/">Status</Link><Link href="/documents">Documents</Link><Link href="/chat">Chat</Link><Link href="/retrieval-debugger">Retrieval debugger</Link></nav>;
}

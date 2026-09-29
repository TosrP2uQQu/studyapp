import Sidebar from './Sidebar';

// Desktop shell: fixed sidebar plus a main area that uses the full width.
export default function Layout({ children, narrow }) {
  return (
    <div className="flex min-h-screen bg-canvas font-sans text-primary">
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar />
      </div>
      <main id="main" className={`min-w-0 flex-1 px-6 py-8 lg:px-12 ${narrow ? 'mx-auto w-full max-w-3xl' : ''}`}>
        {children}
      </main>
    </div>
  );
}

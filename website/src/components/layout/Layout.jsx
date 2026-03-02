import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import './Layout.css';

export function Layout() {
  return (
    <>
      <Navbar />
      <main className="layout__main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

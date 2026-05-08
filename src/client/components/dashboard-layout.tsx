import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Vault, Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/snapshots', label: 'Snapshots' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header — dropdown is a normal block child, NOT absolutely positioned */}
      <header className="border-b border-border bg-card sticky top-0 z-40">

        {/* Main header row */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="p-2 bg-primary rounded-lg">
              <Vault className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            {/* whitespace-nowrap stops "Commit Snapshot Manager" wrapping to 3 lines */}
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">SubVault</h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Commit Snapshot Manager</p>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Dashboard
            </Link>
            <Link to="/snapshots" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Snapshots
            </Link>
          </nav>

          {/* Hamburger — only below md */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen
              ? <X className="h-6 w-6 text-foreground" />
              : <Menu className="h-6 w-6 text-foreground" />
            }
          </button>
        </div>

        {/*
          Mobile menu panel — block element that EXPANDS the header downward.
          Previously used absolute+top-full which gets clipped by the webview container.
          Block flow is reliable in every environment.
        */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <nav className="flex flex-col p-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
          SubVault Dashboard • Designed for DevVit compatibility
        </div>
      </footer>
    </div>
  );
}
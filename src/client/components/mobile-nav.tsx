'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/snapshots', label: 'Snapshots' },
    { to: '/settings', label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          <X className="h-6 w-6 text-foreground" />
        ) : (
          <Menu className="h-6 w-6 text-foreground" />
        )}
      </button>

      {/* Mobile Menu Dropdown — positions relative to the header's `relative` container */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-background border-b border-border md:hidden z-50">
          <nav className="flex flex-col p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-lg text-foreground hover:bg-muted transition-colors font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
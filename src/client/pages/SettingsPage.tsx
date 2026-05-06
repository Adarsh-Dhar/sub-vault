'use client';

import { useState } from 'react';
import { ArrowLeft, Bell, Lock, Database, Shield, Save } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard-layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Link } from 'react-router-dom';

const settingsSections = [
  { id: 'general', label: 'General', icon: Database },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState({
    projectName: 'SubVault',
    email: 'user@example.com',
    autoSnapshot: true,
    notifications: true,
    maxSnapshots: 100,
  });
  const [isSaved, setIsSaved] = useState(false);

  const handleChange = (field: string, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
  };

  const handleSave = () => {
    console.log('Settings saved:', settings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Button */}
       <div className="flex items-center gap-4">
        <Link to="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
            </Button>
        </Link>
        </div>

        {/* Page Header */}
        <div className="border-b border-border pb-6">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your SubVault configuration and preferences</p>
        </div>

        {/* Settings Layout - Sidebar + Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="sticky top-24 space-y-2 flex flex-col">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left w-full ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="font-medium text-sm">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* General Settings */}
            {activeSection === 'general' && (
              <div className="space-y-6">
                <Card className="p-8 border border-border">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Project Settings</h2>
                      <p className="text-muted-foreground text-sm mt-2">
                        Update basic information about your SubVault project
                      </p>
                    </div>
                    <Database className="h-8 w-8 text-primary opacity-60" />
                  </div>

                  <div className="space-y-6">
                    {/* Project Name */}
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Project Name
                      </label>
                      <p className="text-xs text-muted-foreground mb-3">
                        Used to identify your project across the dashboard
                      </p>
                      <Input
                        value={settings.projectName}
                        onChange={(e) => handleChange('projectName', e.target.value)}
                        placeholder="Enter project name"
                        className="bg-muted border-border"
                      />
                    </div>

                    {/* Email */}
                    <div className="border-t border-border pt-6">
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Email Address
                      </label>
                      <p className="text-xs text-muted-foreground mb-3">
                        Your contact email for notifications and updates
                      </p>
                      <Input
                        type="email"
                        value={settings.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="Enter email"
                        className="bg-muted border-border"
                      />
                    </div>

                    {/* Max Snapshots */}
                    <div className="border-t border-border pt-6">
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Maximum Snapshots to Keep
                      </label>
                      <p className="text-xs text-muted-foreground mb-3">
                        Older snapshots will be automatically removed beyond this limit
                      </p>
                      <Input
                        type="number"
                        value={settings.maxSnapshots}
                        onChange={(e) => handleChange('maxSnapshots', parseInt(e.target.value))}
                        placeholder="100"
                        className="bg-muted border-border w-32"
                      />
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Notification Settings */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <Card className="p-8 border border-border">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Notifications</h2>
                      <p className="text-muted-foreground text-sm mt-2">
                        Control how you receive updates and alerts
                      </p>
                    </div>
                    <Bell className="h-8 w-8 text-primary opacity-60" />
                  </div>

                  <div className="space-y-4">
                    {/* Email Notifications Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">Email Notifications</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Get notified about snapshot creation and failures
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={settings.notifications}
                          onChange={(e) => handleChange('notifications', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    {/* Auto Snapshots Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">Auto Snapshots</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically create snapshots when changes are detected
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={settings.autoSnapshot}
                          onChange={(e) => handleChange('autoSnapshot', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted-foreground/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Security Settings */}
            {activeSection === 'security' && (
              <div className="space-y-6">
                <Card className="p-8 border border-border">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Security</h2>
                      <p className="text-muted-foreground text-sm mt-2">
                        Manage your account security and access tokens
                      </p>
                    </div>
                    <Shield className="h-8 w-8 text-primary opacity-60" />
                  </div>

                  <div className="space-y-4">
                    {/* Change Password */}
                    <div className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">Password</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Update your account password
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          Change Password
                        </Button>
                      </div>
                    </div>

                    {/* API Keys */}
                    <div className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">API Keys</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Manage your API keys for authentication
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          View Keys
                        </Button>
                      </div>
                    </div>

                    {/* Two Factor Auth */}
                    <div className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">Two-Factor Authentication</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Add an extra layer of security to your account
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          Enable
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Save Section */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center gap-2">
                {isSaved && (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">Settings saved successfully</span>
                  </div>
                )}
              </div>
              <Button
                onClick={handleSave}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

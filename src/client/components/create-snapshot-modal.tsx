'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import React from 'react';

interface CreateSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { message: string; description: string }) => void;
}

export function CreateSnapshotModal({ isOpen, onClose, onCreate }: CreateSnapshotModalProps) {
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    onCreate({ message, description });
    setMessage('');
    setDescription('');
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Create New Snapshot</DialogTitle>
          <DialogDescription>
            Create a new snapshot to capture the current state of your vault.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Commit Message
            </label>
            <Input
              id="message"
              placeholder="feat: Add new feature"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <Textarea
              id="description"
              placeholder="Describe the changes in this snapshot..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-25"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !message.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Snapshot'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

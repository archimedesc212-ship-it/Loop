import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorState, Modal, Field } from './ui';

describe('shared UI states', () => {
  afterEach(cleanup);
  it('ErrorState explains a database outage and offers retry', () => {
    const retry = vi.fn();
    render(<ErrorState error={{ code: 'DATABASE_UNAVAILABLE', message: 'The music database is unavailable right now.' }} onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('MUSE can’t reach its database');
    fireEvent.click(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalled();
  });
  it('Modal is a labelled dialog that closes on Escape and focuses its first field', () => {
    const close = vi.fn();
    render(<Modal title="Delete" onClose={close}><input aria-label="pw" /></Modal>);
    expect(screen.getByRole('dialog', { name: 'Delete' })).toBeTruthy();
    expect(document.activeElement.getAttribute('aria-label')).toBe('pw');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });
  it('Field ties the label to its input and shows errors instead of hints', () => {
    render(<Field label="Email" hint="We never share it" error="must be a valid email address"><input /></Field>);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('We never share it')).toBeNull();
    expect(screen.getByText('must be a valid email address')).toBeTruthy();
  });
});

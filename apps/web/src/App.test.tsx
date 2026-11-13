import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Groundwork title and badge', async () => {
    render(<App />);
    expect(await screen.findByText('Groundwork V1 Baseline')).toBeInTheDocument();
    expect(await screen.findByText('AI Copilot')).toBeInTheDocument();
  });

  it('renders core capabilities', async () => {
    render(<App />);
    expect(await screen.findByText('Browser-Local DuckDB Execution')).toBeInTheDocument();
    expect(await screen.findByText('Mandatory User Approval Gate')).toBeInTheDocument();
    expect(await screen.findByText('Bring Your Own Key (BYOK)')).toBeInTheDocument();
    expect(await screen.findByText('Immutable Version Control')).toBeInTheDocument();
  });

  it('renders authentication controls', async () => {
    render(<App />);
    expect(await screen.findByText('Access Workspace')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(await screen.findByText('Continue with Google')).toBeInTheDocument();
  });
});

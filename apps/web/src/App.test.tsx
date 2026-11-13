import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Groundwork heading', () => {
    render(<App />);
    expect(screen.getByText('Groundwork')).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<App />);
    expect(screen.getByText('AI-assisted data preparation for everyone')).toBeInTheDocument();
  });

  it('renders feature highlights', () => {
    render(<App />);
    expect(screen.getByText('Upload & Profile')).toBeInTheDocument();
    expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('Approve & Export')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Groundwork landing page headline, glass centerpiece, and primary CTA', async () => {
    render(<App />);
    expect(
      await screen.findByText(/Prepare raw datasets for production ML, right in your browser\./i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Launch Interactive Workspace/i }),
    ).toBeInTheDocument();
    const sculpture = await screen.findByRole('img', {
      name: /3D Groundwork data prism sculpture/i,
    });
    expect(sculpture).toBeInTheDocument();
    expect(sculpture.getAttribute('data-testid')).toMatch(/^groundwork-3d-(stage|mobile)$/);
  });

  it('renders primary navigation and engineering pillars', async () => {
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(nav).toHaveTextContent('Architecture');
    expect(nav).toHaveTextContent('Capabilities');
    expect(nav).toHaveTextContent('Benchmarks');
    expect(nav).toHaveTextContent('Security');
  });

  it('renders workspace access and authentication controls', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(await screen.findByText('Explore Interactive Sandbox')).toBeInTheDocument();
  });
});

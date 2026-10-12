import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../src/App';

/** Shows the router's current location so tests can assert navigation. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return (
    <div data-testid="location" hidden>
      {pathname + search}
    </div>
  );
}

export function renderApp(path: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]} useTransitions={false}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...view };
}

export const currentLocation = () => screen.getByTestId('location').textContent;

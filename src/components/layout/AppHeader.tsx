import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';

const NAV_ITEMS = [
  { to: '/', label: 'Map', icon: 'map-pin' as const },
  { to: '/learn', label: 'Learn', icon: 'book' as const },
  { to: '/report', label: 'Report', icon: 'plus-circle' as const },
  { to: '/about', label: 'About', icon: 'info' as const },
];

const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Following system theme',
};

export function AppHeader() {
  const { preference, resolved, cycle } = useTheme();

  return (
    <header className="header">
      <div className="header__inner">
        {/* The brand links home. `end` keeps the Map nav item from also matching
            every nested route. */}
        <NavLink to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Icon name="tick" size={20} />
          </span>
          <span className="brand__text">
            <span className="brand__name">TickTrack UK</span>
            <span className="brand__tag">Tick sighting tracker</span>
          </span>
        </NavLink>

        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="nav__link"
              /* react-router sets aria-current="page" on an active NavLink
                 automatically, which is what the active style hooks onto. */
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          <button
            type="button"
            className="btn btn--icon btn--ghost"
            onClick={cycle}
            /* The label states the current state and is updated on change, so a
               screen reader user knows what the button did. */
            aria-label={`${THEME_LABEL[preference]}. Activate to change.`}
            title={THEME_LABEL[preference]}
          >
            <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

import { NavLink, useNavigate } from 'react-router-dom';
import { Clock, LayoutGrid, Users, BarChart2, Folder, Settings, LogOut } from 'lucide-react';
import { logout } from '../api';

const links = [
  { to: '/', icon: Clock, label: 'Timer' },
  { to: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Kunden' },
  { to: '/reports', icon: BarChart2, label: 'Berichte' },
  { to: '/projects', icon: Folder, label: 'Projekte' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout().catch(() => {});
    navigate('/login', { replace: true });
  };

  return (
    <nav className="w-56 min-h-screen bg-sidebar flex flex-col py-4 border-r border-border flex-shrink-0">
      <div className="px-4 mb-8 flex items-center gap-2.5">
        <img src="/logo.svg" alt="ClockItNow Logo" className="w-8 h-8 flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
        <span className="text-accent font-bold text-xl tracking-tight">ClockItNow</span>
      </div>

      <ul className="flex flex-col gap-1 px-2 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-secondary hover:text-primary hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Logout */}
      <div className="px-2 mt-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-secondary hover:text-primary hover:bg-white/5 transition-colors"
        >
          <LogOut size={18} />
          Abmelden
        </button>
      </div>
    </nav>
  );
}

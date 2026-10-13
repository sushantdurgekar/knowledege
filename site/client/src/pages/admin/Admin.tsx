// `/admin` (build-contracts.md §21): a lazy chunk with four tabs. Shown in the menu only when
// /api/me says `user.admin`; the server checks again on every /api/admin call, and anyone who
// is not an admin sees the same "Page not found" as for any unknown path.
import '../../styles/admin.css';
import { NavLink, Route, Routes } from 'react-router';
import { BusyLine } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { NotFound } from '../NotFound';
import { BackupTab } from './BackupTab';
import { MaintenanceTab } from './MaintenanceTab';
import { OverviewTab } from './OverviewTab';
import { SettingsTab } from './SettingsTab';

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/backup', label: 'Backup', end: false },
  { to: '/admin/maintenance', label: 'Maintenance & schedule', end: false },
  { to: '/admin/settings', label: 'Settings', end: false },
];

export function Admin() {
  const { me } = useMe();
  if (me.status === 'loading') {
    return (
      <section className="page" aria-label="Admin">
        <BusyLine>Loading…</BusyLine>
      </section>
    );
  }
  if (me.status !== 'signed-in' || !me.user.admin) return <NotFound />;
  return <AdminConsole />;
}

function AdminConsole() {
  useDocumentTitle('Admin');
  return (
    <section className="page page--wide admin" aria-labelledby="page-title">
      <p className="eyebrow">Admin</p>
      <h1 id="page-title">Site admin</h1>
      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="admin-tabs__tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<OverviewTab />} />
        <Route path="backup" element={<BackupTab />} />
        <Route path="maintenance" element={<MaintenanceTab />} />
        <Route path="settings" element={<SettingsTab />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </section>
  );
}

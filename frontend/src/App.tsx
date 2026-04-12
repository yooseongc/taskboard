import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import BoardListPage from './pages/BoardListPage';
import BoardViewPage from './pages/BoardViewPage';
import TemplatesPage from './pages/TemplatesPage';
import OrgPage from './pages/OrgPage';
import AdminUsersPage from './pages/AdminUsersPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<BoardListPage />} />
          <Route path="/boards/:id" element={<BoardViewPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/org" element={<OrgPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

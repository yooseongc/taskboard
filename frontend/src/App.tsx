import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import LoginPage from './pages/LoginPage';
import BoardListPage from './pages/BoardListPage';
import BoardViewPage from './pages/BoardViewPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<BoardListPage />} />
          <Route path="/boards/:id" element={<BoardViewPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;

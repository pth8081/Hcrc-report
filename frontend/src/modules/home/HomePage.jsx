import { useAuth } from '../../lib/AuthContext';

export default function HomePage() {
  const { me } = useAuth();
  return (
    <div className="page">
      <h1>Chào {me?.fullName}</h1>
      <p>Chọn một mục ở thanh bên để bắt đầu.</p>
    </div>
  );
}

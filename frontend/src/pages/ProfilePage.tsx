import { useMe } from '../api/users';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';

export default function ProfilePage() {
  const { data: me, isLoading } = useMe();

  if (isLoading || !me) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8">Profile</h1>

      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Avatar + Name */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{me.name}</h2>
            <p className="text-sm text-gray-500">{me.email}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-gray-400 mb-1">
              Roles
            </span>
            <div className="flex flex-wrap gap-1">
              {me.roles.map((r) => (
                <Badge key={r} className={roleClass(r)}>
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-400 mb-1">
              Status
            </span>
            <Badge
              className={
                me.active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }
            >
              {me.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-400 mb-1">
              Email Verified
            </span>
            <span>{me.email_verified ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-400 mb-1">
              Joined
            </span>
            <span>{new Date(me.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <p className="text-xs text-gray-400 pt-2 border-t">
          Profile information is managed via Active Directory.
        </p>
      </div>
    </div>
  );
}

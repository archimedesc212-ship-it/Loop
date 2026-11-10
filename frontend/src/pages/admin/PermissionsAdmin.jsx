import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';
import { ErrorState, ListSkeleton } from '../../components/ui';

export function PermissionsAdmin() {
  const matrix = useApi(() => api.admin.permissions(), []);
  if (matrix.loading) return <ListSkeleton n={5} />;
  if (matrix.error) return <ErrorState error={matrix.error} onRetry={matrix.reload} />;
  const { permissions, roles } = matrix.data;
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="row wrap small muted"><span>{roles.length} roles</span><span>·</span><span>{permissions.length} permissions</span><span>·</span><span>Read-only view of the live role_permissions mapping</span></div>
      <div className="table-wrap">
        <table className="data permission-matrix">
          <thead><tr><th>Permission</th><th>Description</th>{roles.map((role) => <th key={role.id}>{role.name}</th>)}</tr></thead>
          <tbody>{permissions.map((permission) => (
            <tr key={permission.code}>
              <th scope="row"><code>{permission.code}</code></th>
              <td>{permission.description}</td>
              {roles.map((role) => <td key={role.id} className="permission-cell">{role.permissions.includes(permission.code) ? <span aria-label={`${role.name} has ${permission.code}`} className="permission-yes">✓</span> : <span aria-label={`${role.name} does not have ${permission.code}`} className="muted">—</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="tiny muted">This screen reports current database assignments. It does not edit privileges. API routes continue to enforce permissions on the server, regardless of what is shown here.</p>
    </div>
  );
}

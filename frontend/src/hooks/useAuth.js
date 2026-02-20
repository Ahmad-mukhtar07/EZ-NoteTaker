/**
 * Auth state hook. Consumes AuthContext (session + profile/tier).
 * Use only inside AuthProvider. For route guard: check loading then user.
 */
export { useAuth } from '../contexts/AuthContext.jsx';

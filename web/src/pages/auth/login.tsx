import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiClientError } from '@/lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      qc.invalidateQueries();
      toast.success('Welcome back!');
      if (u?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      toast.error('Login failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign in to your workspace" subtitle="Continue managing your AI calling team.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="mt-4 space-y-2">
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-purple-700 dark:text-purple-300">👑 Platform Superadmin</span>
            <button
              type="button"
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
              onClick={() => {
                setEmail('admin@aicalling.local');
                setPassword('admin1234');
              }}
            >
              Fill Admin
            </button>
          </div>
          <p className="mt-1 font-mono text-[11px]">
            admin@aicalling.local · admin1234
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">🏢 Business Workspace Demo</span>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setEmail('demo@aicalling.local');
                setPassword('demo1234');
              }}
            >
              Fill Demo
            </button>
          </div>
          <p className="mt-1 font-mono text-[11px]">
            demo@aicalling.local · demo1234
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Telugu AI Calling?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
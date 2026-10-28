import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';

export function RegisterPage() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', organizationName: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        organizationName: form.organizationName,
        password: form.password,
      });
      setRegistered(true);
      toast.success('Account created! Check your email to verify.', 'You can sign in using the verify email link.');
    } catch (err) {
      toast.error('Registration failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <AuthLayout title="Account created 🎉" subtitle="One last step before you can start calling.">
        <div className="space-y-4 rounded-xl border p-5">
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <span className="font-medium text-foreground">{form.email}</span>. Open it to
            verify your email, then sign in.
          </p>
          <Link to="/login">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Set up your AI calling workspace in minutes.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required value={form.name} onChange={set('name')} placeholder="Ravi Kumar" autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org">Company name</Label>
          <Input id="org" value={form.organizationName} onChange={set('organizationName')} placeholder="Kumar Enterprises" autoComplete="organization" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="At least 6 characters" autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" required value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
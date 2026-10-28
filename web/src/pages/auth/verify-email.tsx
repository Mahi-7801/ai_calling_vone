import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Missing verification token.');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        toast.success('Email verified!');
      })
      .catch((err: ApiClientError) => {
        setState('error');
        setMessage(err.message);
      });
  }, [params, toast]);

  return (
    <AuthLayout title="Email verification" subtitle="Confirming your email address.">
      {state === 'loading' ? <p className="text-sm text-muted-foreground">Verifying…</p> : null}
      {state === 'ok' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Your email has been verified. You can now sign in.</p>
          <Link to="/login">
            <Button className="w-full">Sign in</Button>
          </Link>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="space-y-4">
          <p className="text-sm text-destructive">{message}</p>
          <Link to="/login">
            <Button variant="outline" className="w-full">
              Back to sign in
            </Button>
          </Link>
        </div>
      ) : null}
    </AuthLayout>
  );
}
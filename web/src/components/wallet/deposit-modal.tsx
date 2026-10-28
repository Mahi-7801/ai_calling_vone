import { useState } from 'react';
import {
  Wallet,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useCreateWalletDeposit, useVerifyWalletDeposit } from '@/hooks/queries';
import { formatCurrencyINR } from '@/lib/utils';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000];

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialAmount?: number;
}

export function DepositFundsModal({
  open,
  onOpenChange,
  onSuccess,
  initialAmount = 500,
}: DepositModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(initialAmount);
  const [customAmount, setCustomAmount] = useState<string>(String(initialAmount));
  const [isProcessing, setIsProcessing] = useState(false);

  const createDeposit = useCreateWalletDeposit();
  const verifyDeposit = useVerifyWalletDeposit();

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomChange = (valStr: string) => {
    setCustomAmount(valStr);
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleStartPayment = async () => {
    if (!amount || amount < 100) {
      toast.error('Minimum Deposit', 'Minimum wallet deposit amount is ₹100.');
      return;
    }

    setIsProcessing(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Could not load Razorpay payment gateway. Please check your internet connection.');
      }

      // 1. Create order on backend
      const res = await createDeposit.mutateAsync({ amount });
      const order = res.order;

      // 2. Open Razorpay Checkout modal
      await new Promise<void>((resolve, reject) => {
        const options = {
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency || 'INR',
          name: 'Telugu AI Calling Platform',
          description: `Wallet Balance Top-Up (₹${order.amount})`,
          order_id: order.orderId,
          prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || '',
          },
          theme: {
            color: '#7c3aed',
          },
          modal: {
            ondismiss: () => {
              reject(new Error('Payment window closed'));
            },
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              // 3. Cryptographic backend verification & atomic wallet credit
              const verifyRes = await verifyDeposit.mutateAsync({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });

              toast.success(
                'Wallet Recharged!',
                `Successfully added ₹${verifyRes.amount_inr} to your account. Current available: ₹${verifyRes.wallet.available_inr}`
              );

              if (onSuccess) onSuccess();
              onOpenChange(false);
              resolve();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Verification failed';
              toast.error('Verification Error', msg);
              reject(err);
            }
          },
        };

        const razorpayInstance = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay(options);
        razorpayInstance.open();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment process cancelled';
      if (!msg.includes('closed') && !msg.includes('cancelled')) {
        toast.error('Payment Error', msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold">Add Money to Wallet</DialogTitle>
              <p className="text-xs text-muted-foreground">Instant deposit via UPI, Cards, or NetBanking</p>
            </div>
          </div>
        </DialogHeader>

        {/* Preset Amount Pills */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Choose Amount</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleSelectPreset(val)}
                className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                  amount === val
                    ? 'border-primary bg-primary/10 text-primary shadow-xs'
                    : 'border-border/80 hover:border-primary/50 text-foreground bg-card'
                }`}
              >
                ₹{val}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Or Enter Custom Amount (₹)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm text-muted-foreground">₹</span>
            <Input
              type="number"
              min="100"
              max="100000"
              value={customAmount}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="pl-7 font-mono text-base font-bold h-10"
              placeholder="e.g. 1500"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Minimum deposit: ₹100. Maximum: ₹1,00,000.</p>
        </div>

        {/* Security & Info Notice */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Funds are credited to your append-only financial ledger immediately upon payment. Unused funds remain safely in your balance with no expiry.
          </span>
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleStartPayment}
            disabled={!amount || amount < 100 || isProcessing}
            loading={isProcessing}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5 px-5 shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" /> Pay {formatCurrencyINR(amount || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

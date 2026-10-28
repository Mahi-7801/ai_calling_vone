const { query } = require('../../config/db');

async function migrate() {
  console.log('>>> Running Wallet Ledger & Phone Number Orders Migration (PostgreSQL)...');

  // 1. Wallets table (stores integer paise for exact financial precision)
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER,
      balance_paise BIGINT NOT NULL DEFAULT 0,
      reserved_paise BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✓ wallets table ensured');

  // Seed wallets from credit_wallets if not present
  const existingWallets = await query('SELECT organization_id FROM wallets');
  const existingOrgIds = new Set(existingWallets.map(w => w.organization_id));

  const creditWallets = await query('SELECT * FROM credit_wallets');
  for (const cw of creditWallets) {
    if (!existingOrgIds.has(cw.organization_id)) {
      const balancePaise = Math.round(Number(cw.balance || 0) * 100);
      await query(
        `INSERT INTO wallets (organization_id, balance_paise, reserved_paise, currency) 
         VALUES ($1, $2, 0, 'INR')`,
        [cw.organization_id, balancePaise]
      );
      console.log(`✓ seeded wallet for organization ${cw.organization_id} with ${balancePaise} paise (₹${cw.balance})`);
    }
  }

  // 2. Wallet Transactions table (Append-only Financial Ledger)
  await query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER,
      amount_paise BIGINT NOT NULL,
      type VARCHAR(50) NOT NULL, -- deposit, purchase_reservation, purchase_deduction, reservation_release, refund, admin_adjustment, reversal
      status VARCHAR(30) NOT NULL DEFAULT 'completed', -- pending, completed, failed, cancelled, reversed
      reference VARCHAR(120) NOT NULL UNIQUE,
      balance_after_paise BIGINT NOT NULL,
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_id ON wallet_transactions(wallet_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_org_id ON wallet_transactions(organization_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_created_at ON wallet_transactions(created_at DESC);`);
  console.log('✓ wallet_transactions table ensured');

  // 3. Razorpay Orders table
  await query(`
    CREATE TABLE IF NOT EXISTS razorpay_orders (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER,
      amount_paise BIGINT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status VARCHAR(30) NOT NULL DEFAULT 'created', -- created, paid, failed, expired
      receipt VARCHAR(100),
      payment_id VARCHAR(100),
      signature VARCHAR(255),
      webhook_payload JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_razorpay_orders_org_id ON razorpay_orders(organization_id);`);
  console.log('✓ razorpay_orders table ensured');

  // 4. Number Orders table (Tracks State Machine for number buying)
  await query(`
    CREATE TABLE IF NOT EXISTS number_orders (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER,
      phone_number VARCHAR(50) NOT NULL,
      provider VARCHAR(30) NOT NULL DEFAULT 'vobiz',
      carrier_item_id VARCHAR(100),
      carrier_order_id VARCHAR(100),
      number_type VARCHAR(30) DEFAULT 'local',
      region VARCHAR(100),
      setup_fee_paise BIGINT NOT NULL DEFAULT 0,
      monthly_fee_paise BIGINT NOT NULL DEFAULT 0,
      markup_paise BIGINT NOT NULL DEFAULT 0,
      total_charged_paise BIGINT NOT NULL,
      provider_cost_paise BIGINT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'CREATED', -- CREATED, FUNDS_RESERVED, PROVIDER_PURCHASE_PENDING, PURCHASE_CONFIRMED, COMPLETED, FAILED, REFUNDED
      error_message TEXT,
      carrier_result JSONB,
      assigned_employee_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_number_orders_org_id ON number_orders(organization_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_number_orders_phone ON number_orders(phone_number);`);
  console.log('✓ number_orders table ensured');

  // 5. Provider Balance Snapshots table
  await query(`
    CREATE TABLE IF NOT EXISTS provider_balance_snapshots (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL DEFAULT 'vobiz',
      reported_balance NUMERIC(12, 2) NOT NULL,
      available_balance NUMERIC(12, 2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      is_live BOOLEAN NOT NULL DEFAULT true,
      raw_response JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_prov_snap_created ON provider_balance_snapshots(created_at DESC);`);
  console.log('✓ provider_balance_snapshots table ensured');

  // 6. Admin Settings (markup, safety threshold, etc.)
  await query(`
    CREATE TABLE IF NOT EXISTS platform_financial_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      value VARCHAR(255) NOT NULL,
      description TEXT,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  
  const defaultSettings = [
    { key: 'phone_markup_inr', value: '100', description: 'Platform markup added to number setup/purchase fee in INR' },
    { key: 'provider_safety_reserve_inr', value: '50', description: 'Minimum admin carrier balance to retain as reserve' },
    { key: 'min_deposit_inr', value: '100', description: 'Minimum wallet deposit amount in INR' },
    { key: 'max_deposit_inr', value: '100000', description: 'Maximum wallet deposit amount in INR' },
    { key: 'allow_low_balance_orders', value: 'false', description: 'Block purchases if provider balance is below safety reserve' },
  ];

  for (const s of defaultSettings) {
    await query(
      `INSERT INTO platform_financial_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value, s.description]
    );
  }
  console.log('✓ platform_financial_settings ensured');

  console.log('>>> Migration successfully completed!');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

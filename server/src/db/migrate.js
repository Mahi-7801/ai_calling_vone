const { migrate } = require('./schema');

async function main() {
  try {
    await migrate();
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

main();
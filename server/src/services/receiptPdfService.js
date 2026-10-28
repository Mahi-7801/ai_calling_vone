const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'receipt-template.pdf');

function formatCurrency(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date) {
  const d = new Date(date || Date.now());
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function generateReceiptPdf(payment) {
  let templateBuffer;
  try {
    templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  } catch (err) {
    templateBuffer = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Receipt-INV-MAN-EA2B3C51 (1).pdf'));
  }
  const str = templateBuffer.toString('latin1');

  function getObj(num) {
    const oStart = str.indexOf(num + ' 0 obj');
    const oEnd = str.indexOf('endobj', oStart) + 6;
    return templateBuffer.slice(oStart, oEnd);
  }

  // Decompress object 4 content stream
  const pIdx = str.indexOf('stream\n', str.indexOf('4 0 obj'));
  const endIdx = str.indexOf('\nendstream', pIdx);
  const streamData = templateBuffer.slice(pIdx + 7, endIdx);
  let content = zlib.inflateSync(streamData).toString('latin1');

  const receiptNumber = payment.reference && payment.reference.startsWith('INV-') 
    ? payment.reference 
    : `INV-MAN-${String(payment.id || 1).padStart(4, '0')}${Date.now().toString(16).slice(-4).toUpperCase()}`;
  
  const orgName = (payment.org_name || 'Vone Digitals').slice(0, 32);
  const contactName = (payment.user_name || payment.billing_contact || 'Vone Employee').slice(0, 32);
  const userEmail = (payment.user_email || payment.billing_email || 'voneemp@gmail.com').slice(0, 36);
  const workspaceId = (payment.org_slug || orgName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'vonedigitals').slice(0, 24);

  const gateway = payment.provider === 'vobiz' 
    ? 'VoBiz PSTN' 
    : (payment.provider === 'admin_grant' ? 'Admin Grant' : 'Razorpay Online');
    
  const paymentId = (payment.provider_payment_id || payment.reference || `PHONEPE-${Date.now().toString().slice(-10)}`).slice(0, 28);
  const dateTimeStr = formatDate(payment.created_at);
  const amountStr = formatCurrency(payment.amount || 0);

  // Description / Plan
  let desc = 'Enterprise Plan Subscription';
  if (payment.description) desc = payment.description;
  else if (payment.metadata) {
    try {
      const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata;
      if (meta.description) desc = meta.description;
    } catch (_) {}
  }
  desc = desc.slice(0, 36);

  const billingCycle = 'Monthly / Recurring';

  // Replace exact strings in decompressed stream
  content = content
    .replace('STATUS: CAPTURED', payment.status === 'paid' ? 'STATUS: PAID' : `STATUS: ${String(payment.status).toUpperCase()}`)
    .replace('INV-MAN-EA2B3C51', receiptNumber)
    .replace('(sesiagency)', `(${orgName})`)
    .replace('(Contact: Vone Employee)', `(Contact: ${contactName})`)
    .replace('(Email: voneemp@gmail.com)', `(Email: ${userEmail})`)
    .replace('(Workspace ID: sesiagency)', `(Workspace ID: ${workspaceId})`)
    .replace('(Razorpay Online)', `(${gateway})`)
    .replace('(PHONEPE-1789709986)', `(${paymentId})`)
    .replace('(18 Sep 2026, 05:39 AM)', `(${dateTimeStr})`)
    .replace('( Enterprise Plan Subscription)', `( ${desc})`)
    .replace('(Monthly / Recurring)', `(${billingCycle})`)
    .replaceAll('Rs. 5,999.00 ', `${amountStr} `)
    .replace('Rs. 0.00 ', 'Rs. 0.00 ');

  const newStream = zlib.deflateSync(Buffer.from(content, 'latin1'));

  const obj4 = Buffer.concat([
    Buffer.from('4 0 obj\n<</Filter /FlateDecode /Length ' + newStream.length + '>>\nstream\n', 'latin1'),
    newStream,
    Buffer.from('\nendstream\nendobj', 'latin1')
  ]);

  const objects = {
    1: getObj(1),
    2: getObj(2),
    3: getObj(3),
    4: obj4,
    5: getObj(5),
    6: getObj(6),
    7: getObj(7),
    8: getObj(8),
    9: getObj(9),
    10: getObj(10),
    11: getObj(11),
    12: getObj(12),
  };

  const objOrder = [3, 4, 1, 5, 6, 7, 8, 9, 10, 2, 11, 12];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = {};

  for (const id of objOrder) {
    const currentOffset = parts.reduce((acc, p) => acc + p.length, 0);
    offsets[id] = currentOffset;
    parts.push(objects[id]);
    parts.push(Buffer.from('\n', 'latin1'));
  }

  const xrefStart = parts.reduce((acc, p) => acc + p.length, 0);
  let xref = 'xref\n0 13\n0000000000 65535 f \n';
  for (let i = 1; i <= 12; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    xref += offStr + ' 00000 n \n';
  }

  const trailer = 'trailer\n<<\n/Size 13\n/Root 12 0 R\n/Info 11 0 R\n>>\nstartxref\n' + xrefStart + '\n%%EOF\n';
  parts.push(Buffer.from(xref + trailer, 'latin1'));

  return {
    pdfBuffer: Buffer.concat(parts),
    filename: `Receipt-${receiptNumber}.pdf`,
    receiptNumber,
  };
}

module.exports = {
  generateReceiptPdf,
};

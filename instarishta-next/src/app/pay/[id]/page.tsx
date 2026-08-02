/**
 * /pay/[id] — the hosted checkout.
 *
 * A gateway's checkout page is server-rendered from an order the server already
 * fixed, and so is this one: the amount, the plan and the QR all come from the
 * database row, never from a query string. Nothing on this page can be talked
 * into charging a different number.
 *
 * The QR is rendered to SVG here rather than in the browser so the encoder never
 * reaches the client bundle, and so the payment code is present in the very
 * first paint — this page is opened on a phone, mid-purchase, and a QR that
 * pops in late is a QR that gets screenshotted half-drawn.
 */
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';
import { ORDER_COLS, upiQrPayload, type Order } from '@/lib/orders';
import PayClient from './PayClient';

export const metadata = {
  title: 'Complete your payment',
  robots: { index: false, follow: false },
};

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    redirect(`/?signin=1&next=${encodeURIComponent(`/pay/${id}`)}`);
  }

  const db = serviceClient();
  const { data: order } = await db
    .from('ir_orders').select(ORDER_COLS).eq('id', id).maybeSingle<Order>();

  // Someone else's order is indistinguishable from a missing one — an id in a
  // shared screenshot must not reveal that it is real.
  if (!order || order.email !== session.user.email) notFound();

  const qrSvg = await QRCode.toString(upiQrPayload(order), {
    type: 'svg',
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
    color: { dark: '#141413', light: '#FFFFFF' },
  });

  return <PayClient order={order} qrSvg={qrSvg} />;
}

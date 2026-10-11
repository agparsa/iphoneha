import type { Metadata } from 'next';
import { getAddresses } from '@/lib/api/endpoints';
import { AddressBook } from '@/components/store/address-book';

export const metadata: Metadata = { title: 'آدرس‌های من', robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const addresses = await getAddresses();
  return <AddressBook initialAddresses={addresses} />;
}

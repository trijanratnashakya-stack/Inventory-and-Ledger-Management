'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canEdit } from '@/lib/format';
import { useUser } from '@/components/AppShell';
import ProductForm from '@/components/ProductForm';
import { Alert } from '@/components/ui';

export default function NewProductPage() {
  const router = useRouter();
  const user = useUser();

  if (!canEdit(user)) return <Alert>You do not have permission to add products.</Alert>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Add Product</h1>
          <p className="sub">
            <Link href="/inventory" className="link-btn">
              ← Back to inventory
            </Link>
          </p>
        </div>
      </div>
      <section className="card" style={{ maxWidth: 760 }}>
        <h2>Product Info</h2>
        <ProductForm mode="create" onSaved={(p) => router.push(`/inventory/${p._id}`)} />
      </section>
    </>
  );
}

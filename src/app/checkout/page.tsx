import { CheckoutForm } from "@/features/checkout/components/checkout-form";

export default function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8">
        <CheckoutForm />
      </div>
    </main>
  );
}

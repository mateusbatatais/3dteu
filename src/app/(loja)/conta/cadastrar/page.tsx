"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function CadastrarPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailMessage, setConfirmEmailMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message || "Não foi possível criar a conta.");
      return;
    }

    // Se o projeto Supabase exige confirmação de e-mail, o cadastro não
    // entrega uma sessão ativa na hora — precisa avisar em vez de tentar
    // redirecionar pra uma página protegida sem sessão.
    if (!data.session) {
      setConfirmEmailMessage("Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.");
      return;
    }

    router.push("/conta");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>Acompanhe seus pedidos e agilize a próxima compra.</CardDescription>
        </CardHeader>
        <CardContent>
          {confirmEmailMessage ? (
            <p className="text-sm text-muted-foreground">{confirmEmailMessage}</p>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" disabled={isSubmitting} className="mt-2">
                  {isSubmitting ? "Criando conta..." : "Criar conta"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link href="/conta/entrar" className="text-foreground underline-offset-2 hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
